
        // --- DOM элементы ---
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const playerInfo = document.getElementById('player-info');
        const angleInfo = document.getElementById('angle-info');
        const forceInfo = document.getElementById('force-info');
        const windInfo = document.getElementById('wind-info');
        const cpuInfo = document.getElementById('cpu-info');
        const playerBonusInfo = document.getElementById('player-bonus-info');
        const aimingInfo = document.getElementById('aiming-info');
        const messageBox = document.getElementById('messageBox');
        
        // --- Константы ---
        const GRAVITY = 0.08;
        const TANK_BODY_WIDTH = 30;
        const TANK_BODY_HEIGHT = 12;
        const TANK_TREAD_HEIGHT = 6;
        const TURRET_LENGTH = 28;
        const EXPLOSION_RADIUS = 35;
        const MAX_WIND = 0.08;
        const MAX_HEALTH = 100;
        const BONUS_RADIUS = 15;
        const BONUS_SPAWN_CHANCE = 0.20; 
        const SNOWFLAKE_COUNT = 150;
        const TERRAIN_SETTLE_FRAMES = 20;

        // --- Переменные игры ---
        let terrain = [];
        let player, cpu, projectile, explosions = [];
        let wind = 0;
        let currentPlayer;
        let gameState = 'START';
        let bonuses = [];
        let snowflakes = [];
        let particles = [];
        let terrainSettleCountdown = 0;
        let showAimingLine = false;
        let actionInterval = null;
        let messageTimeout = null;

        // --- Классы ---
        class Tank {
            constructor(x, color, direction) {
                this.x = x; this.y = 0; this.color = color; this.angle = 45; this.force = 50;
                this.direction = direction; this.health = MAX_HEALTH; this.fuel = 100;
                this.powerShells = 0; this.shieldHealth = 0; this.clusterShells = 0;
            }
            draw() {
                if (this.health <= 0) return;
                const roundedX = Math.round(this.x);
                if (roundedX >= 0 && roundedX < terrain.length) {
                    this.y = terrain[roundedX];
                } else { this.health = 0; }
                
                ctx.save();
                ctx.translate(this.x, this.y);

                const healthBarWidth = 40;
                const healthBarHeight = 5;
                const healthBarY = -TANK_BODY_HEIGHT - TANK_TREAD_HEIGHT - 10;
                ctx.fillStyle = '#dc2626'; ctx.fillRect(-healthBarWidth / 2, healthBarY, healthBarWidth, healthBarHeight);
                ctx.fillStyle = '#22c55e'; ctx.fillRect(-healthBarWidth / 2, healthBarY, healthBarWidth * (this.health / MAX_HEALTH), healthBarHeight);

                // Корпус и гусеницы
                const bodyY = -TANK_TREAD_HEIGHT - TANK_BODY_HEIGHT;
                ctx.fillStyle = '#4A4A4A';
                ctx.fillRect(-TANK_BODY_WIDTH/2 - 2, -TANK_TREAD_HEIGHT, TANK_BODY_WIDTH + 4, TANK_TREAD_HEIGHT);
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.moveTo(-TANK_BODY_WIDTH / 2, bodyY);
                ctx.lineTo(TANK_BODY_WIDTH / 2, bodyY);
                ctx.lineTo(TANK_BODY_WIDTH / 2 + 3, -TANK_TREAD_HEIGHT);
                ctx.lineTo(-TANK_BODY_WIDTH / 2 - 3, -TANK_TREAD_HEIGHT);
                ctx.closePath();
                ctx.fill();

                // Башня
                const turretY = bodyY + TANK_BODY_HEIGHT/2;
                const turretAngleRad = (this.direction === 1) ? -this.angle * Math.PI / 180 : -(180 - this.angle) * Math.PI / 180;
                ctx.save();
                ctx.translate(0, turretY);
                ctx.rotate(turretAngleRad);
                ctx.fillStyle = "#A9A9A9";
                ctx.fillRect(0, -3, TURRET_LENGTH, 6);
                ctx.restore();
                
                ctx.fillStyle = '#808080';
                ctx.beginPath();
                ctx.arc(0, turretY, 8, 0, Math.PI * 2);
                ctx.fill();

                if (this.shieldHealth > 0) {
                    ctx.beginPath();
                    ctx.arc(0, -15, TANK_BODY_WIDTH, 0, Math.PI * 2);
                    const shieldOpacity = Math.min(1, this.shieldHealth / 50);
                    ctx.fillStyle = `rgba(0, 191, 255, ${0.3 * shieldOpacity})`; ctx.fill();
                    ctx.strokeStyle = `rgba(0, 191, 255, ${0.8 * shieldOpacity})`; ctx.lineWidth = 2; ctx.stroke();
                }
                
                ctx.restore();
            }
            getTurretEnd() {
                const turretY = -TANK_TREAD_HEIGHT - TANK_BODY_HEIGHT/2;
                const turretAngleRad = (this.direction === 1) ? -this.angle * Math.PI / 180 : -(180 - this.angle) * Math.PI / 180;
                return { 
                    x: this.x + Math.cos(turretAngleRad) * TURRET_LENGTH, 
                    y: this.y + turretY + Math.sin(turretAngleRad) * TURRET_LENGTH 
                };
            }
            takeDamage(damage) {
                if (this.shieldHealth > 0) {
                    const absorbed = Math.min(this.shieldHealth, damage);
                    this.shieldHealth -= absorbed; damage -= absorbed;
                }
                this.health -= damage; if (this.health < 0) this.health = 0;
            }
            move(amount) {
                if (this.fuel <= 0) return;
                const moveAmount = Math.sign(amount) * Math.min(Math.abs(amount) * 2, this.fuel);
                const newX = this.x + moveAmount;
                if (newX > TANK_BODY_WIDTH / 2 && newX < canvas.width - TANK_BODY_WIDTH / 2) {
                    this.x = newX; this.fuel -= Math.abs(moveAmount);
                }
            }
        }

        class Projectile {
            constructor(x, y, vx, vy, isPowerful, isCluster) {
                this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.path = [{x, y}];
                this.isPowerful = isPowerful; this.isCluster = isCluster;
            }
            update() {
                for (let i = 0; i < 3; i++) {
                    const particleX = this.x - this.vx, particleY = this.y - this.vy;
                    const angle = Math.atan2(-this.vy, -this.vx) + (Math.random() - 0.5) * 0.5;
                    const speed = Math.random() * 2 + 1;
                    particles.push(new Particle(particleX, particleY, angle, speed, 15, 'rgba(255, 200, 100, 0.8)'));
                }
                this.vx += wind; this.vy += GRAVITY; this.x += this.vx; this.y += this.vy;
                this.path.push({x: this.x, y: this.y});
                if (this.path.length > 30) this.path.shift();
            }
            draw() {
                ctx.beginPath();
                ctx.moveTo(this.path[0].x, this.path[0].y);
                for (let i = 1; i < this.path.length; i++) ctx.lineTo(this.path[i].x, this.path[i].y);
                if (this.isPowerful) { ctx.strokeStyle = 'rgba(255, 165, 0, 0.7)'; ctx.lineWidth = 4; } 
                else if (this.isCluster) { ctx.strokeStyle = 'rgba(255, 105, 180, 0.7)'; ctx.lineWidth = 4; } 
                else { ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'; ctx.lineWidth = 2; }
                ctx.stroke();
                if (this.isPowerful) ctx.fillStyle = '#FFA500';
                else if (this.isCluster) ctx.fillStyle = '#FF69B4';
                else ctx.fillStyle = 'yellow';
                ctx.beginPath(); ctx.arc(this.x, this.y, this.isPowerful || this.isCluster ? 6: 4, 0, Math.PI * 2); ctx.fill();
            }
        }

        class Explosion {
            constructor(x, y, isPowerful = false, radiusMultiplier = 1) {
                this.x = x; this.y = y; this.radius = 5; this.isPowerful = isPowerful;
                this.maxRadius = (isPowerful ? EXPLOSION_RADIUS * 1.5 : EXPLOSION_RADIUS) * radiusMultiplier;
                this.life = 30; this.damageDealt = false;
            }
            update() {
                this.radius += (this.maxRadius - this.radius) * 0.1; this.life--;
                if (!this.damageDealt) { this.applyDamage(); this.damageDealt = true; }
            }
            draw() {
                const color = this.isPowerful ? `255, ${this.life * 5}, 0` : `255, ${this.life * 8}, 0`;
                ctx.fillStyle = `rgba(${color}, ${this.life / 30})`;
                ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
            }
            applyDamage() {
                [player, cpu].forEach(tank => {
                    if (!tank || tank.health <= 0) return;
                    const dist = Math.sqrt(Math.pow(this.x - tank.x, 2) + Math.pow(this.y - tank.y, 2));
                    if (dist < this.maxRadius) {
                        const damage = Math.round((this.maxRadius - dist) * (this.isPowerful ? 2.5 : 1.5));
                        tank.takeDamage(damage);
                    }
                });
                updateUI(); checkGameOver();
            }
        }
        
        class Bonus {
            constructor(type) {
                this.x = Math.random() * (canvas.width - 200) + 100; this.y = -20;
                this.vy = 0; this.onGround = false; this.type = type; this.radius = BONUS_RADIUS;
            }
            update() {
                if (this.onGround) return;
                this.vy += GRAVITY * 0.1; this.y += this.vy; this.x += wind * 5;
                const groundY = (terrain[Math.round(this.x)] || canvas.height);
                if(this.y >= groundY - this.radius) {
                    this.y = groundY - this.radius;
                    this.onGround = true;
                }
            }
            draw() {
                ctx.save(); ctx.translate(this.x, this.y);
                if (!this.onGround) {
                    ctx.fillStyle = "rgba(230, 230, 230, 0.9)";
                    ctx.beginPath(); ctx.arc(0, -this.radius * 2, this.radius * 1.5, Math.PI, 0); ctx.fill();
                    ctx.strokeStyle = "white"; ctx.beginPath();
                    ctx.moveTo(-this.radius, -this.radius * 1.8); ctx.lineTo(0, 0);
                    ctx.moveTo(this.radius, -this.radius * 1.8); ctx.lineTo(0, 0); ctx.stroke();
                }
                const pulse = Math.sin(Date.now() * 0.005) * 0.1 + 0.9;
                ctx.scale(pulse, pulse); ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
                const typeMap = {
                    'MOVE': { color: '#00FF00', char: 'M'}, 'POWER_SHELL': { color: '#FFA500', char: 'P'},
                    'SHIELD': { color: '#00BFFF', char: 'S'}, 'CLUSTER': { color: '#FF69B4', char: 'C'}
                };
                const config = typeMap[this.type];
                ctx.fillStyle = config.color.slice(0, 7) + 'B3'; ctx.strokeStyle = config.color;
                ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = 'white'; ctx.font = `${this.radius}px 'Press Start 2P'`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(config.char, 0, 2); ctx.restore();
            }
        }

        class Particle {
            constructor(x, y, angle, speed, life, color) {
                this.x = x; this.y = y; this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
                this.life = life; this.maxLife = life; this.color = color; this.radius = Math.random() * 2 + 1;
            }
            update() { this.x += this.vx; this.y += this.vy; this.life--; }
            draw() {
                ctx.fillStyle = this.color.replace(/, [0-9.]+\)/, `, ${this.life / this.maxLife})`);
                ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill();
            }
        }
        
        // --- Функции ---
function generateTerrain() {
    terrain = new Array(canvas.width).fill(canvas.height);
    const isPortrait = canvas.height > canvas.width;
    const startY = isPortrait ? canvas.height * 0.6 : canvas.height * 0.7;
    let y = startY;

    // --- ИЗМЕНЕНИЕ 1: Увеличиваем "скалистость" для альбомной ориентации ---
    // В альбомном режиме (isPortrait = false), высота canvas меньше,
    // что делало горы более гладкими. Мы увеличим начальную величину
    // смещения (magnitude) для альбомного режима, чтобы компенсировать это.
    const initialMagnitude = isPortrait ? canvas.height / 3 : canvas.height / 1.5;
    // Вы можете поэкспериментировать со значением, например, canvas.height / 1.5 для еще более острых гор
    // --- КОНЕЦ ИЗМЕНЕНИЯ 1 ---

    const roughness = 0.6;
    function displace(arr, start, end, magnitude) {
        if (end - start < 2) return;
        const mid = Math.floor((start + end) / 2);
        if (mid <= start || mid >= end) return;
        arr[mid] = (arr[start] + arr[end]) / 2 + (Math.random() - 0.5) * magnitude;
        displace(arr, start, mid, magnitude * roughness);
        displace(arr, mid, end, magnitude * roughness);
    }
    terrain[0] = y;
    terrain[canvas.width - 1] = y * (Math.random() * 0.4 + 0.8);

    // Используем новую переменную initialMagnitude вместо canvas.height/3
    if (canvas.width > 1) displace(terrain, 0, canvas.width - 1, initialMagnitude);

    for (let i = 0; i < terrain.length; i++) {
        if (terrain[i] > canvas.height - 20) terrain[i] = canvas.height - 20;
        if (terrain[i] < canvas.height / 3) terrain[i] = canvas.height / 3;
    }
}
        
        function updateTerrainPhysics() {
            if (terrainSettleCountdown <= 0) return;
            terrainSettleCountdown--;
            const slopeThreshold = 1.5;
            for (let i = 1; i < terrain.length; i++) {
                if (terrain[i] > terrain[i - 1] + slopeThreshold) {
                    const diff = (terrain[i] - terrain[i-1]) * 0.1;
                    terrain[i] -= diff; terrain[i - 1] += diff;
                }
            }
            for (let i = terrain.length - 2; i >= 0; i--) {
                if (terrain[i] > terrain[i + 1] + slopeThreshold) {
                    const diff = (terrain[i] - terrain[i+1]) * 0.1;
                    terrain[i] -= diff; terrain[i + 1] += diff;
                }
            }
        }
        
        function initSnow() {
            snowflakes = [];
            for (let i = 0; i < SNOWFLAKE_COUNT; i++) {
                snowflakes.push({
                    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
                    radius: Math.random() * 2 + 1,
                    baseSpeed: Math.random() * 0.5 + 0.2
                });
            }
        }

        function drawAndUpdateSnow() {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            for (const flake of snowflakes) {
                const windFactor = wind / MAX_WIND;
                flake.x += windFactor * 10;
                flake.y += flake.baseSpeed + Math.abs(windFactor * 1.5);

                if (flake.y > canvas.height) {
                    flake.y = -5;
                    flake.x = Math.random() * canvas.width;
                }
                if (flake.x > canvas.width) flake.x = 0;
                if (flake.x < 0) flake.x = canvas.width;
                
                ctx.moveTo(flake.x, flake.y);
                ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
            }
            ctx.fill();
        }

        function spawnBonus() {
            if (bonuses.length > 2) return;
            if (Math.random() < BONUS_SPAWN_CHANCE) {
                const typeRoll = Math.random();
                let type;
                if (typeRoll < 0.25) type = 'MOVE';
                else if (typeRoll < 0.50) type = 'POWER_SHELL';
                else if (typeRoll < 0.75) type = 'SHIELD';
                else type = 'CLUSTER';
                bonuses.push(new Bonus(type));
            }
        }

        function drawScene() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#00001a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawAndUpdateSnow();
            
            const gradient = ctx.createLinearGradient(0, canvas.height / 3, 0, canvas.height);
            gradient.addColorStop(0, '#FFFFFF');
            gradient.addColorStop(0.5, '#D3D3D3');
            gradient.addColorStop(1, '#A9A9A9');
            ctx.fillStyle = gradient;

            ctx.beginPath(); ctx.moveTo(0, canvas.height);
            for (let i = 0; i < canvas.width; i++) ctx.lineTo(i, terrain[i]);
            ctx.lineTo(canvas.width, canvas.height); ctx.closePath(); ctx.fill();
        }
        
        function deformTerrain(x, y, radius) {
            for (let i = 0; i < canvas.width; i++) {
                if (i < 0 || i >= terrain.length) continue;
                const distSqr = Math.pow(x - i, 2) + Math.pow(y - terrain[i], 2);
                if (distSqr < radius*radius) {
                     terrain[i] += Math.sqrt(radius*radius - (x-i)*(x-i)) - (y > terrain[i] ? Math.abs(y-terrain[i]) : -Math.abs(y-terrain[i]));
                }
            }
            terrainSettleCountdown = TERRAIN_SETTLE_FRAMES;
        }
        
        function updateUI() {
            if(!player || !cpu) return;
            playerInfo.innerHTML = `СССР 🛡️: ${Math.round(player.health)}`;
            cpuInfo.innerHTML = `USA 🛡️: ${Math.round(cpu.health)}`;

            if(currentPlayer === player){
                angleInfo.textContent = `Угол: ${Math.round(player.angle)}`;
                forceInfo.textContent = `Сила: ${Math.round(player.force)}`;
            }
            let windText = (wind > 0 ? ">>" : wind < 0 ? "<<" : "--");
            const windStrength = Math.round((Math.abs(wind) / MAX_WIND) * 10);
            windInfo.textContent = `Ветер: ${windText} ${windStrength}`;
            playerBonusInfo.textContent = `Топливо: ${Math.round(player.fuel)} | Мощь: ${player.powerShells} | Щит: ${Math.round(player.shieldHealth)} | Кассета: ${player.clusterShells}`;
            aimingInfo.textContent = `Прицел(T): ${showAimingLine ? 'ВКЛ' : 'ВЫКЛ'}`;
        }
        
        function showMessage(text, duration = null) {
            if(messageTimeout) clearTimeout(messageTimeout);
            messageBox.innerHTML = text.replace(/\n/g, '<br>');
            messageBox.classList.remove('hidden');
            if (duration) {
                messageTimeout = setTimeout(() => {
                    messageBox.classList.add('hidden');
                }, duration);
            }
        }

        function init() {
            resizeCanvas();
            generateTerrain(); 
            initSnow();
            player = new Tank(Math.random() * (canvas.width/4) + 50, '#d9534f', 1);
            cpu = new Tank(canvas.width - Math.random()*(canvas.width/4) - 50, '#5bc0de', -1);
            projectile = null; explosions = []; bonuses = []; particles = [];
            currentPlayer = player;
            wind = (Math.random() - 0.5) * MAX_WIND;
            gameState = 'PLAYING';
            messageBox.classList.add('hidden');
            updateUI();
        }

        function switchPlayer() {
            currentPlayer = (currentPlayer === player) ? cpu : player;
            // --- ИСПРАВЛЕНИЕ: Ветер меняется не каждый ход ---
            if (Math.random() < 0.5) { // 50% шанс на смену ветра
                wind = (Math.random() - 0.5) * MAX_WIND;
                showMessage("Ветер изменился!", 1500); // Сообщаем игроку
            }
            if (gameState === 'PLAYING') spawnBonus();
            updateUI();
            if (currentPlayer === cpu && gameState === 'PLAYING') setTimeout(cpuTurn, 1000);
        }

        function simulateShot(angle, force) {
            const power = force/10, angleRad = (cpu.direction===1)?angle*Math.PI/180:(180-angle)*Math.PI/180;
            let vx=Math.cos(angleRad)*power, vy=-Math.sin(angleRad)*power;
            let simX=cpu.getTurretEnd().x, simY=cpu.getTurretEnd().y;
            for (let t=0; t<500; t++) {
                vx+=wind; vy+=GRAVITY; simX+=vx; simY+=vy;
                const terrainY = (Math.round(simX)>=0 && Math.round(simX)<canvas.width)?terrain[Math.round(simX)]:canvas.height;
                if (simY>terrainY) return {x:simX, y:simY};
                if (simX<0 || simX>canvas.width) return null;
            }
            return null;
        }
        
        function cpuTurn() {
            const roundedX = Math.round(cpu.x);
            if (cpu.fuel > 20 && (cpu.y > terrain[roundedX] + 5 || (terrain[roundedX - 10] < cpu.y - 20 && terrain[roundedX + 10] < cpu.y - 20))) {
                showMessage("USA ищет позицию получше...", 1000);
                cpu.move(player.x > cpu.x ? 10 : -10);
                updateUI();
                setTimeout(switchPlayer, 1500);
                return;
            }
            showMessage("USA думает...", 1000);
            let bestShot = { angle: 0, force: 0, distance: Infinity };
            for (let i = 0; i < 30; i++) {
                const testAngle=Math.random()*90, testForce=Math.random()*80+20;
                const landingPos=simulateShot(testAngle, testForce);
                if (landingPos) {
                    const distance=Math.sqrt(Math.pow(landingPos.x - player.x, 2) + Math.pow(landingPos.y - player.y, 2));
                    if (distance < bestShot.distance) bestShot={angle: testAngle, force: testForce, distance: distance};
                }
            }
            cpu.angle = bestShot.angle + (Math.random() - 0.5) * 5;
            cpu.force = bestShot.force + (Math.random() - 0.5) * 10;
            updateUI();
            setTimeout(fire, 1500);
        }

        function fire() {
            if (projectile) return;
            const startPos = currentPlayer.getTurretEnd();
            const angleRad = (currentPlayer.direction===1)?currentPlayer.angle*Math.PI/180:(180-currentPlayer.angle)*Math.PI/180;
            const power=currentPlayer.force/10, vx=Math.cos(angleRad)*power, vy=-Math.sin(angleRad)*power;
            let isPowerfulShot = false, isClusterShot = false;
            if (currentPlayer.powerShells > 0) {
                currentPlayer.powerShells--; isPowerfulShot = true;
            } else if (currentPlayer.clusterShells > 0) {
                currentPlayer.clusterShells--; isClusterShot = true;
            }
            projectile = new Projectile(startPos.x, startPos.y, vx, vy, isPowerfulShot, isClusterShot);
            updateUI();
        }
        
        function checkGameOver() {
            if (gameState !== 'PLAYING') return;
            if (player.health <= 0 || cpu.health <= 0) {
                 gameState = 'GAMEOVER';
                 let winnerName = player.health > 0 ? "СССР" : "USA";
                 if(player.health <=0 && cpu.health <=0) winnerName = "Никто не";
                 showMessage(`${winnerName} победил!\nНажмите 'R' или 🔄 для рестарта.`);
            }
        }

        function checkCollisions() {
            if (!projectile) return;
            const x=Math.round(projectile.x), y=Math.round(projectile.y);
            for (let i=bonuses.length-1; i>=0; i--) {
                const bonus=bonuses[i];
                if (!bonus.onGround) continue;
                const dist=Math.sqrt(Math.pow(projectile.x - bonus.x, 2) + Math.pow(projectile.y - bonus.y, 2));
                if (dist < bonus.radius + 10) {
                    if(bonus.type==='MOVE') currentPlayer.fuel+=50;
                    if(bonus.type==='POWER_SHELL') currentPlayer.powerShells+=3;
                    if(bonus.type==='SHIELD') currentPlayer.shieldHealth+=50;
                    if(bonus.type==='CLUSTER') currentPlayer.clusterShells+=3;
                    bonuses.splice(i, 1);
                    updateUI();
                }
            }
            if (x >= 0 && x < canvas.width && y > terrain[x]) {
                if (projectile.isCluster) {
                    for(let i = 0; i < 4; i++) {
                        const offsetX = (Math.random() - 0.5) * 50, offsetY = (Math.random() - 0.5) * 50;
                        explosions.push(new Explosion(projectile.x + offsetX, projectile.y + offsetY, false, 0.7));
                    }
                } else {
                    explosions.push(new Explosion(projectile.x, projectile.y, projectile.isPowerful));
                }
                deformTerrain(projectile.x, projectile.y, projectile.isPowerful ? EXPLOSION_RADIUS*1.5 : EXPLOSION_RADIUS);
                projectile = null; return;
            }
            if (projectile.x<0 || projectile.x>canvas.width || projectile.y>canvas.height+200) {
                projectile = null; if (explosions.length === 0) setTimeout(switchPlayer, 1000);
            }
        }
        
        function drawAimingLine() {
            if (!showAimingLine || currentPlayer !== player || projectile || explosions.length > 0) return;
            const startPos=player.getTurretEnd();
            const angleRad=(player.direction===1)?player.angle*Math.PI/180:(180-player.angle)*Math.PI/180;
            const power=player.force/10; let vx=Math.cos(angleRad)*power, vy=-Math.sin(angleRad)*power;
            let simX=startPos.x, simY=startPos.y;
            ctx.setLineDash([5, 10]); ctx.beginPath(); ctx.moveTo(simX, simY);
            for (let t=0; t<200; t++) {
                vy+=GRAVITY; simX+=vx; simY+=vy;
                if (t%5===0) ctx.lineTo(simX, simY);
                const terrainY=(Math.round(simX)>=0 && Math.round(simX)<canvas.width)?terrain[Math.round(simX)]:canvas.height;
                if (simY > terrainY || simX < 0 || simX > canvas.width) break;
            }
            ctx.strokeStyle='rgba(255, 255, 255, 0.5)'; ctx.lineWidth=2; ctx.stroke(); ctx.setLineDash([]);
        }

        function gameLoop() {
            if (gameState !== 'START') {
                 drawScene();
                updateTerrainPhysics();
                particles.forEach((p, i) => { p.update(); if (p.life < 0) particles.splice(i, 1); else p.draw(); });
                bonuses.forEach(b => {b.update(); b.draw()});
                drawAimingLine();
                player.draw(); cpu.draw();
                if (player.y > canvas.height+TANK_BODY_HEIGHT && player.health > 0) { player.health=0; checkGameOver(); }
                if (cpu.y > canvas.height+TANK_BODY_HEIGHT && cpu.health > 0) { cpu.health=0; checkGameOver(); }
                if (projectile) { projectile.update(); projectile.draw(); checkCollisions(); }
                if (explosions.length > 0) {
                    explosions.forEach(exp => { exp.update(); exp.draw(); });
                    explosions = explosions.filter(exp => exp.life > 0);
                    if (explosions.length === 0 && gameState === 'PLAYING' && !projectile) {
                        setTimeout(switchPlayer, 1000);
                    }
                }
            }
            requestAnimationFrame(gameLoop);
        }

        function handlePlayerAction(action) {
            if (currentPlayer !== player || gameState !== 'PLAYING' || projectile || explosions.length > 0) return;
            action();
            updateUI();
        }
        
        function setupInputHandlers() {
            window.addEventListener('keydown', e => {
                if (e.code === 'KeyR') {
                    init();
                    return;
                }
                if (gameState === 'START' || gameState === 'GAMEOVER') {
                    if (e.code !== 'KeyT') init();
                    return;
                }
                if (e.code === 'KeyT') { 
                    showAimingLine = !showAimingLine; 
                    updateUI(); 
                    return; 
                }
                handlePlayerAction(() => {
                    switch (e.code) {
                        case 'ArrowUp': player.force = Math.min(100, player.force + 1); break;
                        case 'ArrowDown': player.force = Math.max(0, player.force - 1); break;
                        case 'ArrowLeft': player.angle = Math.max(0, player.angle - 1); break;
                        case 'ArrowRight': player.angle = Math.min(90, player.angle + 1); break;
                        case 'Space': fire(); break;
                        case 'KeyA': player.move(-5); break;
                        case 'KeyD': player.move(5); break;
                    }
                });
            });

            const controls = [
                { id: 'move-left-btn', action: () => player.move(-2) },
                { id: 'move-right-btn', action: () => player.move(2) },
                { id: 'angle-down-btn', action: () => { player.angle = Math.max(0, player.angle - 1); } },
                { id: 'angle-up-btn', action: () => { player.angle = Math.min(90, player.angle + 1); } },
                { id: 'force-down-btn', action: () => { player.force = Math.max(0, player.force - 1); } },
                { id: 'force-up-btn', action: () => { player.force = Math.min(100, player.force + 1); } },
            ];
            const startAction = (action) => {
                if (actionInterval) clearInterval(actionInterval);
                handlePlayerAction(action);
                actionInterval = setInterval(() => handlePlayerAction(action), 100);
            };
            const stopAction = () => { clearInterval(actionInterval); actionInterval = null; };
            controls.forEach(control => {
                const btn = document.getElementById(control.id);
                btn.addEventListener('touchstart', (e) => { e.preventDefault(); startAction(control.action); }, { passive: false });
                btn.addEventListener('touchend', stopAction);
                btn.addEventListener('touchcancel', stopAction);
            });
            document.getElementById('fire-button').addEventListener('touchstart', (e) => { e.preventDefault(); handlePlayerAction(fire); });
            document.getElementById('aim-toggle-btn').addEventListener('touchstart', (e) => { e.preventDefault(); showAimingLine = !showAimingLine; updateUI(); });
            document.getElementById('restart-btn').addEventListener('touchstart', (e) => { e.preventDefault(); init(); });
            messageBox.addEventListener('click', () => { if (gameState === 'START' || gameState === 'GAMEOVER') init(); });
        }

        function resizeCanvas() {
            const gameContainer = document.querySelector('.game-container');
            canvas.width = gameContainer.clientWidth;
            canvas.height = gameContainer.clientHeight;
        }

        window.addEventListener('resize', init);
        
        setupInputHandlers();
        resizeCanvas();
        const startMessage = 'ontouchstart' in window 
            ? "Нажимайте кнопки для управления"
            : "Стрелки - Угол/Сила | Пробел - Выстрел\nA/D - Движение | T - Прицел | R - Рестарт";
        showMessage(startMessage + "\n\nНажмите для старта");
gameLoop(); 





// Регистрация Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}