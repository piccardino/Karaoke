// Three.js Background Visualization
class KaraokeVisualizer {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        
        this.particles = null;
        this.waveMesh = null;
        this.time = 0;
        this.audioEnergy = 0.5; // Simulated audio energy
        
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
        this.createLights();
        
        // Handle resize
        window.addEventListener('resize', () => this.onResize());
        
        // Start animation
        this.animate();
    }
    
    createParticles() {
        const particleCount = 1500;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        
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
    
    createLights() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambient);
        
        // Point lights for dynamic coloring
        const light1 = new THREE.PointLight(0xff006e, 2, 100);
        light1.position.set(20, 20, 20);
        this.scene.add(light1);
        
        const light2 = new THREE.PointLight(0x3a86ff, 2, 100);
        light2.position.set(-20, 20, 20);
        this.scene.add(light2);
        
        const light3 = new THREE.PointLight(0xffbe0b, 2, 100);
        light3.position.set(0, -20, 20);
        this.scene.add(light3);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.time += 0.01;
        
        // Animate particles
        if (this.particles) {
            this.particles.rotation.y += 0.001;
            this.particles.rotation.x += 0.0005;
            
            const positions = this.particles.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] += Math.sin(this.time + positions[i] * 0.1) * 0.02 * this.audioEnergy;
            }
            this.particles.geometry.attributes.position.needsUpdate = true;
        }
        
        // Animate wave
        if (this.waveMesh) {
            const positions = this.waveMesh.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i];
                const y = positions[i + 1];
                positions[i + 2] = Math.sin(x * 0.1 + this.time * 2) * 
                                   Math.cos(y * 0.1 + this.time) * 
                                   3 * this.audioEnergy;
            }
            this.waveMesh.geometry.attributes.position.needsUpdate = true;
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
