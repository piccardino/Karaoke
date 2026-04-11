// Three.js Background Visualization
class KaraokeVisualizer {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

        this.particles = null;
        this.waveMesh = null;
        this.bars = null;
        this.time = 0;
        this.audioEnergy = 0.3;
        this.frequencies = new Array(64).fill(0); // Frequency bands for beat detection
        this.isAudioConnected = false;

        this.init();
    }

    init() {
        // Setup renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Setup camera
        this.camera.position.z = 50;

        // Create visualizations
        this.createParticles();
        this.createWave();
        this.createBars();
        this.createLights();

        // Handle resize
        window.addEventListener('resize', () => this.onResize());

        // Start animation
        this.animate();
    }

    connectAudio(audioElement) {
        if (this.isAudioConnected) return;

        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 128;
            this.analyser.smoothingTimeConstant = 0.8;

            // Connect audio element to analyser
            const source = this.audioContext.createMediaElementSource(audioElement);
            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            this.isAudioConnected = true;
            console.log('✓ Audio connected to visualizer');
        } catch (error) {
            console.log('Audio connection failed:', error.message);
            // Fallback to simulated mode
            this.isAudioConnected = false;
        }
    }

    updateFrequencies() {
        if (this.isAudioConnected && this.analyser) {
            this.analyser.getByteFrequencyData(this.frequencyData);

            // Copy to our frequencies array
            for (let i = 0; i < this.frequencies.length && i < this.frequencyData.length; i++) {
                this.frequencies[i] = this.frequencyData[i] / 255; // Normalize to 0-1
            }

            // Calculate overall energy
            this.audioEnergy = this.frequencies.reduce((a, b) => a + b, 0) / this.frequencies.length;
        } else {
            // Simulated frequencies (fallback)
            this.time += 0.01;
            for (let i = 0; i < this.frequencies.length; i++) {
                this.frequencies[i] = 0.3 +
                    Math.sin(this.time * 2 + i * 0.2) * 0.2 +
                    Math.random() * 0.1;
            }
            this.audioEnergy = 0.3 + Math.sin(this.time * 3) * 0.2;
        }
    }

    createParticles() {
        const particleCount = 1500;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const originalY = new Float32Array(particleCount);

        const colorPalette = [
            new THREE.Color(0xff006e), // Pink
            new THREE.Color(0x8338ec), // Purple
            new THREE.Color(0x3a86ff), // Blue
            new THREE.Color(0xfb5607), // Orange
            new THREE.Color(0xffbe0b), // Yellow
        ];

        for (let i = 0; i < particleCount; i++) {
            // Position
            positions[i * 3] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
            originalY[i] = positions[i * 3 + 1];

            // Color
            const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            // Size
            sizes[i] = Math.random() * 2 + 0.5;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 1,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
        });

        this.particles = new THREE.Points(geometry, material);
        this.particles.originalY = originalY;
        this.scene.add(this.particles);
    }

    createWave() {
        const geometry = new THREE.PlaneGeometry(100, 100, 128, 128);

        const material = new THREE.MeshPhongMaterial({
            color: 0x8338ec,
            wireframe: true,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
        });

        this.waveMesh = new THREE.Mesh(geometry, material);
        this.waveMesh.rotation.x = -Math.PI / 2;
        this.waveMesh.position.y = -20;
        this.scene.add(this.waveMesh);
    }

    createBars() {
        // Create frequency bars visualization
        const barCount = 32;
        const geometry = new THREE.BoxGeometry(1.5, 1, 1.5);
        const material = new THREE.MeshPhongMaterial({
            color: 0xff006e,
            emissive: 0x8338ec,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.6,
        });

        this.bars = new THREE.InstancedMesh(geometry, material, barCount);
        this.bars.count = barCount;

        // Position bars in a semi-circle
        this.barPositions = [];
        for (let i = 0; i < barCount; i++) {
            const angle = (i / barCount) * Math.PI - Math.PI / 2;
            const radius = 35;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius - 10;
            const y = -15;

            const matrix = new THREE.Matrix4();
            matrix.setPosition(x, y, z);
            this.bars.setMatrixAt(i, matrix);

            this.barPositions.push({ x, y, z });
        }

        this.bars.instanceMatrix.needsUpdate = true;
        this.scene.add(this.bars);
    }

    createLights() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambient);

        // Point lights for dynamic coloring
        this.light1 = new THREE.PointLight(0xff006e, 2, 100);
        this.light1.position.set(20, 20, 20);
        this.scene.add(this.light1);

        this.light2 = new THREE.PointLight(0x3a86ff, 2, 100);
        this.light2.position.set(-20, 20, 20);
        this.scene.add(this.light2);

        this.light3 = new THREE.PointLight(0xffbe0b, 2, 100);
        this.light3.position.set(0, -20, 20);
        this.scene.add(this.light3);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Update frequency data
        this.updateFrequencies();

        // Animate particles based on frequencies
        if (this.particles) {
            this.particles.rotation.y += 0.001 + this.audioEnergy * 0.002;
            this.particles.rotation.x += 0.0005 + this.audioEnergy * 0.001;

            const positions = this.particles.geometry.attributes.position.array;
            const originalY = this.particles.originalY;

            for (let i = 0; i < positions.length; i += 3) {
                const particleIndex = i / 3;
                const freqIndex = particleIndex % this.frequencies.length;
                const freq = this.frequencies[freqIndex];

                // Beat reaction - particles jump on beat
                positions[i + 1] = originalY[particleIndex] +
                    Math.sin(this.time * 2 + positions[i] * 0.1) * freq * 5 +
                    freq * 3; // Extra boost on beats
            }
            this.particles.geometry.attributes.position.needsUpdate = true;

            // Scale particles on beat
            const beat = this.frequencies[0] + this.frequencies[1]; // Bass frequencies
            this.particles.scale.setScalar(1 + beat * 0.1);
        }

        // Animate wave based on frequencies
        if (this.waveMesh) {
            const positions = this.waveMesh.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i];
                const y = positions[i + 1];
                const freqIndex = Math.abs(Math.floor((x + 50) / 100 * this.frequencies.length));
                const freq = this.frequencies[freqIndex] || 0;

                positions[i + 2] = Math.sin(x * 0.1 + this.time * 2) *
                                   Math.cos(y * 0.1 + this.time) *
                                   (2 + freq * 8);
            }
            this.waveMesh.geometry.attributes.position.needsUpdate = true;

            // Change wave color based on dominant frequency
            const dominantFreq = this.frequencies.indexOf(Math.max(...this.frequencies));
            const hue = dominantFreq / this.frequencies.length;
            this.waveMesh.material.color.setHSL(hue, 0.8, 0.5);
        }

        // Animate bars (frequency visualization)
        if (this.bars) {
            const matrix = new THREE.Matrix4();
            for (let i = 0; i < this.bars.count; i++) {
                const freq = this.frequencies[i] || 0;
                const pos = this.barPositions[i];
                const height = 1 + freq * 15;

                matrix.makeTranslation(
                    pos.x,
                    pos.y + height / 2,
                    pos.z
                );
                this.bars.setMatrixAt(i, matrix);
            }
            this.bars.instanceMatrix.needsUpdate = true;

            // Update bar colors based on frequency
            const color = new THREE.Color();
            for (let i = 0; i < this.bars.count; i++) {
                const freq = this.frequencies[i] || 0;
                color.setHSL(i / this.bars.count, 0.8, 0.3 + freq * 0.5);
                this.bars.setColorAt(i, color);
            }
            if (this.bars.instanceColor) {
                this.bars.instanceColor.needsUpdate = true;
            }
        }

        // Animate lights based on music
        if (this.light1 && this.light2) {
            const bass = (this.frequencies[0] + this.frequencies[1] + this.frequencies[2]) / 3;
            const treble = (this.frequencies[this.frequencies.length - 1] +
                           this.frequencies[this.frequencies.length - 2]) / 2;

            this.light1.intensity = 1 + bass * 3;
            this.light2.intensity = 1 + treble * 3;
            this.light3.intensity = 1 + this.audioEnergy * 2;
        }

        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    setAudioEnergy(value) {
        this.audioEnergy = Math.max(0, Math.min(1, value));
    }
}
