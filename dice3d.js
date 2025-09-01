class Dice3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.outerDice = null;
        this.innerDice = null;
        this.diceGroup = null;
        this.isRolling = false;
        this.onRollComplete = null;
        this.stlLoader = null;
        this.continuousRotation = true;
        this.lastTime = null; // For 60 FPS time-based animation

        this.init();
        this.setupEnhancedLighting();
        this.loadDiceModels();
        this.animate();
    }

    init() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = null; // Transparent background

        // Camera setup
        const containerRect = this.container.getBoundingClientRect();
        this.camera = new THREE.PerspectiveCamera(
            50,
            containerRect.width / containerRect.height,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 6);
        this.camera.lookAt(0, 0, 0); // Adjust these values if dice still appears off-center
        // Example: this.camera.lookAt(0.1, 0, 0); to shift right
        // Example: this.camera.lookAt(0, 0.1, 0); to shift up

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(containerRect.width, containerRect.height);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;

        // Add renderer to container
        this.container.appendChild(this.renderer.domElement);

        // Create dice group for nested rotation
        this.diceGroup = new THREE.Group();
        this.diceGroup.position.set(0, -0.3, 0); // Move dice lower in the view
        // Adjust the Y value: more negative = lower position
        // Examples: -0.5 (lower), -0.1 (higher), 0.2 (higher)
        this.scene.add(this.diceGroup);

        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupEnhancedLighting() {
        // Ambient light for base illumination
        const ambientLight = new THREE.AmbientLight(0x2a2a2a, 0.3);
        this.scene.add(ambientLight);

        // Main directional light (key light)
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
        keyLight.position.set(3, 3, 2);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        keyLight.shadow.camera.near = 0.1;
        keyLight.shadow.camera.far = 10;
        keyLight.shadow.camera.left = -2;
        keyLight.shadow.camera.right = 2;
        keyLight.shadow.camera.top = 2;
        keyLight.shadow.camera.bottom = -2;
        this.scene.add(keyLight);

        // Fill light
        const fillLight = new THREE.DirectionalLight(0x88ccff, 0.4);
        fillLight.position.set(-2, 1, -1);
        this.scene.add(fillLight);

        // Rim light for edge definition
        const rimLight = new THREE.DirectionalLight(0xff6b6b, 0.3);
        rimLight.position.set(0, -2, -3);
        this.scene.add(rimLight);

        // Point lights for dramatic effect
        const pointLight1 = new THREE.PointLight(0x00ffff, 0.5, 100);
        pointLight1.position.set(3, 2, 3);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0xff00ff, 0.3, 100);
        pointLight2.position.set(-3, -1, -2);
        this.scene.add(pointLight2);

        // Spot light for focused illumination
        const spotLight = new THREE.SpotLight(0xffffff, 0.8);
        spotLight.position.set(0, 5, 0);
        spotLight.target.position.set(0, 0, 0);
        spotLight.angle = Math.PI / 6;
        spotLight.penumbra = 0.1;
        spotLight.castShadow = true;
        spotLight.shadow.mapSize.width = 1024;
        spotLight.shadow.mapSize.height = 1024;
        this.scene.add(spotLight);
        this.scene.add(spotLight.target);
    }

    loadDiceModels() {
        // Initialize STL loader
        if (typeof THREE.STLLoader !== 'undefined') {
            this.stlLoader = new THREE.STLLoader();
        } else {
            console.error('STLLoader not available');
            return;
        }

        // Load outer dice (dice.stl)
        this.loadOuterDice();

        // Load inner dice (dicei.stl)
        this.loadInnerDice();
    }

    loadOuterDice() {
        this.stlLoader.load(
            'dice.stl',
            (geometry) => {
                this.onOuterDiceLoaded(geometry);
            },
            (progress) => {
                console.log('Outer dice loading:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading outer dice:', error);
                this.createFallbackOuterDice();
            }
        );
    }

    loadInnerDice() {
        this.stlLoader.load(
            'dicei.stl',
            (geometry) => {
                this.onInnerDiceLoaded(geometry);
            },
            (progress) => {
                console.log('Inner dice loading:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading inner dice:', error);
                this.createFallbackInnerDice();
            }
        );
    }

    onOuterDiceLoaded(geometry) {
        geometry.computeVertexNormals();

        // Create material for outer dice
        const material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.1,
            roughness: 0.1,
            transmission: 0.7,
            opacity: 0.9,
            transparent: true,
            clearcoat: 0.8,
            clearcoatRoughness: 0.02,
            ior: 1.45,
            thickness: 0.5,
            envMapIntensity: 1.2,
            specularIntensity: 0.3,
            emissive: 0x111111,
            emissiveIntensity: 0.02
        });

        // Create outer dice mesh
        this.outerDice = new THREE.Mesh(geometry, material);
        this.outerDice.castShadow = true;
        this.outerDice.receiveShadow = true;

        // Scale and center
        this.scaleAndCenterMesh(this.outerDice, 2.6);

        // Add to dice group
        this.diceGroup.add(this.outerDice);
        console.log('Outer dice loaded successfully');
    }

    onInnerDiceLoaded(geometry) {
        geometry.computeVertexNormals();

        // Create material for inner dice (white and bright)
        const material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.1,
            roughness: 0.1,
            transmission: 0.9,
            opacity: 0.85,
            transparent: true,
            clearcoat: 0.95,
            clearcoatRoughness: 0.02,
            ior: 1.45,
            thickness: 0.4,
            envMapIntensity: 1.2,
                         emissive: 0x444444,
            emissiveIntensity: 0.08
        });

        // Create inner dice mesh
        this.innerDice = new THREE.Mesh(geometry, material);
        this.innerDice.castShadow = true;
        this.innerDice.receiveShadow = true;

        // Scale and center (bigger than outer dice)
        this.scaleAndCenterMesh(this.innerDice, 1.7);

        // Position inside outer dice
        this.innerDice.position.set(0, 0, 0);

        // Add to outer dice so it rotates with it
        if (this.outerDice) {
            this.outerDice.add(this.innerDice);
        } else {
            this.diceGroup.add(this.innerDice);
        }

        console.log('Inner dice loaded successfully');
    }

    createFallbackOuterDice() {
        const geometry = new THREE.BoxGeometry(2.6, 2.6, 2.6, 8, 8, 8);
        const material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.1,
            roughness: 0.1,
            transmission: 0.7,
            opacity: 0.9,
            transparent: true
        });

        this.outerDice = new THREE.Mesh(geometry, material);
        this.diceGroup.add(this.outerDice);
        console.log('Fallback outer dice created');
    }

    createFallbackInnerDice() {
        const geometry = new THREE.BoxGeometry(1.7, 1.7, 1.7, 8, 8, 8);
        const material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.1,
            roughness: 0.1,
            transmission: 0.9,
            opacity: 0.85,
            transparent: true,
            clearcoat: 0.95,
            clearcoatRoughness: 0.02,
            ior: 1.45,
            thickness: 0.4,
            envMapIntensity: 1.2,
            emissive: 0x444444,
            emissiveIntensity: 0.08
        });

        this.innerDice = new THREE.Mesh(geometry, material);
        this.innerDice.position.set(0, 0, 0);

        if (this.outerDice) {
            this.outerDice.add(this.innerDice);
        } else {
            this.diceGroup.add(this.innerDice);
        }
        console.log('Fallback inner dice created');
    }

    scaleAndCenterMesh(mesh, targetSize) {
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Center the model
        mesh.position.sub(center);

        // Scale to target size
        const maxDimension = Math.max(size.x, size.y, size.z);
        const scale = targetSize / maxDimension;
        mesh.scale.setScalar(scale);
    }

    addDotsToFaces() {
        // Dot patterns for each face (1-6)
        const dotPatterns = {
            0: [], // Front face (1)
            1: [4], // Back face (2)
            2: [0, 2, 6, 8], // Right face (3)
            3: [0, 2, 6, 8], // Left face (4)
            4: [0, 2, 4, 6, 8], // Top face (5)
            5: [1, 3, 4, 5, 7] // Bottom face (6)
        };

        // Dot material
        const dotMaterial = new THREE.MeshPhongMaterial({
            color: 0x000000,
            shininess: 100
        });

        // Dot geometry (small spheres)
        const dotGeometry = new THREE.SphereGeometry(0.08, 16, 16);

        // Face positions and rotations
        const faceData = [
            { position: [0, 0, 1.01], rotation: [0, 0, 0] }, // Front
            { position: [0, 0, -1.01], rotation: [0, Math.PI, 0] }, // Back
            { position: [1.01, 0, 0], rotation: [0, Math.PI/2, 0] }, // Right
            { position: [-1.01, 0, 0], rotation: [0, -Math.PI/2, 0] }, // Left
            { position: [0, 1.01, 0], rotation: [-Math.PI/2, 0, 0] }, // Top
            { position: [0, -1.01, 0], rotation: [Math.PI/2, 0, 0] } // Bottom
        ];

        // Dot positions in 3x3 grid on each face
        const dotPositions = [
            [-0.4, 0.4, 0], [0, 0.4, 0], [0.4, 0.4, 0],
            [-0.4, 0, 0], [0, 0, 0], [0.4, 0, 0],
            [-0.4, -0.4, 0], [0, -0.4, 0], [0.4, -0.4, 0]
        ];

        // Create dots for each face
        faceData.forEach((face, faceIndex) => {
            const faceGroup = new THREE.Group();

            dotPatterns[faceIndex].forEach(dotIndex => {
                const dot = new THREE.Mesh(dotGeometry, dotMaterial);
                dot.position.set(...dotPositions[dotIndex]);
                faceGroup.add(dot);
            });

            faceGroup.position.set(...face.position);
            faceGroup.rotation.set(...face.rotation);
            this.dice.add(faceGroup);
        });
    }

    roll(targetFace = null) {
        if (this.isRolling) return;

        this.isRolling = true;
        this.continuousRotation = false; // Pause continuous rotation during roll

        // Random rotations for rolling animation (slower)
        const rotations = {
            group: {
                x: Math.random() * Math.PI * 3 + Math.PI * 1.5, // Half the rotation
                y: Math.random() * Math.PI * 3 + Math.PI * 1.5,
                z: Math.random() * Math.PI * 3 + Math.PI * 1.5
            },
            outer: {
                x: Math.random() * Math.PI * 2 + Math.PI * 1, // Half the rotation
                y: Math.random() * Math.PI * 2 + Math.PI * 1,
                z: Math.random() * Math.PI * 2 + Math.PI * 1
            },
            inner: {
                x: Math.random() * Math.PI * 4 + Math.PI * 2, // Half the rotation
                y: Math.random() * Math.PI * 4 + Math.PI * 2,
                z: Math.random() * Math.PI * 4 + Math.PI * 2
            }
        };

        // Animation duration (balanced timing)
        const duration = 1500;
        const startTime = Date.now();

        // Store original rotations for smooth transition
        const originalGroupRotations = {
            x: this.diceGroup.rotation.x,
            y: this.diceGroup.rotation.y,
            z: this.diceGroup.rotation.z
        };

        const originalOuterRotations = this.outerDice ? {
            x: this.outerDice.rotation.x,
            y: this.outerDice.rotation.y,
            z: this.outerDice.rotation.z
        } : {x: 0, y: 0, z: 0};

        const originalInnerRotations = this.innerDice ? {
            x: this.innerDice.rotation.x,
            y: this.innerDice.rotation.y,
            z: this.innerDice.rotation.z
        } : {x: 0, y: 0, z: 0};

        const animateRoll = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function for smooth animation
            const easeOut = 1 - Math.pow(1 - progress, 4);

            // Apply rotations to dice group
            this.diceGroup.rotation.x = originalGroupRotations.x + easeOut * rotations.group.x;
            this.diceGroup.rotation.y = originalGroupRotations.y + easeOut * rotations.group.y;
            this.diceGroup.rotation.z = originalGroupRotations.z + easeOut * rotations.group.z;

            // Apply rotations to outer dice
            if (this.outerDice) {
                this.outerDice.rotation.x = originalOuterRotations.x + easeOut * rotations.outer.x;
                this.outerDice.rotation.y = originalOuterRotations.y + easeOut * rotations.outer.y;
                this.outerDice.rotation.z = originalOuterRotations.z + easeOut * rotations.outer.z;
            }

            // Apply rotations to inner dice (faster and more chaotic)
            if (this.innerDice) {
                this.innerDice.rotation.x = originalInnerRotations.x + easeOut * rotations.inner.x;
                this.innerDice.rotation.y = originalInnerRotations.y + easeOut * rotations.inner.y;
                this.innerDice.rotation.z = originalInnerRotations.z + easeOut * rotations.inner.z;
            }

            // Add bounce effect to the entire group
            const bounce = Math.sin(progress * Math.PI * 3) * 0.15 * (1 - progress);
            this.diceGroup.position.y = bounce;

            if (progress < 1) {
                requestAnimationFrame(animateRoll);
            } else {
                this.isRolling = false;
                this.continuousRotation = true; // Resume continuous rotation
                if (this.onRollComplete) {
                    this.onRollComplete();
                }
            }
        };

        animateRoll();
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Calculate time delta for 60 FPS smooth animation
        const currentTime = performance.now();
        const deltaTime = this.lastTime ? (currentTime - this.lastTime) / 1000 : 1/60; // Target 60 FPS
        this.lastTime = currentTime;

        // Continuous rotation when not rolling (60 FPS optimized)
        if (this.continuousRotation && !this.isRolling) {
            // Base rotation speeds per second (will be scaled by deltaTime)
            const baseSpeeds = {
                group: { x: 0.045, y: 0.03 },     // Half speed again (~0.00075/frame at 60 FPS)
                outer: { x: 0.075, y: 0.045, z: 0.015 }, // Half speed again (~0.00125/frame at 60 FPS)
                inner: { x: 0.12, y: 0.09, z: 0.06 }     // Half speed again (~0.002/frame at 60 FPS)
            };

            // Apply time-based rotation for smooth 60 FPS
            this.diceGroup.rotation.x += baseSpeeds.group.x * deltaTime;
            this.diceGroup.rotation.y += baseSpeeds.group.y * deltaTime;

            // Outer dice rotation (60 FPS)
            if (this.outerDice) {
                this.outerDice.rotation.x += baseSpeeds.outer.x * deltaTime;
                this.outerDice.rotation.y += baseSpeeds.outer.y * deltaTime;
                this.outerDice.rotation.z += baseSpeeds.outer.z * deltaTime;
            }

            // Inner dice rotation (60 FPS)
            if (this.innerDice) {
                this.innerDice.rotation.x += baseSpeeds.inner.x * deltaTime;
                this.innerDice.rotation.y += baseSpeeds.inner.y * deltaTime;
                this.innerDice.rotation.z += baseSpeeds.inner.z * deltaTime;
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        const containerRect = this.container.getBoundingClientRect();
        this.camera.aspect = containerRect.width / containerRect.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(containerRect.width, containerRect.height);
    }

    setRollCompleteCallback(callback) {
        this.onRollComplete = callback;
    }
}