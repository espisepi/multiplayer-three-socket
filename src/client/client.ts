import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import Stats from 'three/examples/jsm/libs/stats.module';
import { GUI } from 'dat.gui';
import { io, Socket } from 'socket.io-client';

class Renderer {
    private renderer: THREE.WebGLRenderer;

    constructor() {
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
    }

    get domElement() {
        return this.renderer.domElement;
    }

    render(scene: THREE.Scene, camera: THREE.Camera) {
        this.renderer.render(scene, camera);
    }

    resize(camera: THREE.PerspectiveCamera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

class Camera {
    public camera: THREE.PerspectiveCamera;

    constructor() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 4;
    }

    get instance() {
        return this.camera;
    }
}

class Scene {
    private scene: THREE.Scene;

    constructor() {
        this.scene = new THREE.Scene();
    }

    get instance() {
        return this.scene;
    }

    add(object: THREE.Object3D) {
        this.scene.add(object);
    }

    remove(object: THREE.Object3D) {
        this.scene.remove(object);
    }
}

class Controls {
    private controls: OrbitControls;

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
        this.controls = new OrbitControls(camera, domElement);
    }

    update() {
        this.controls.update();
    }
}

class GridHelper {
    private gridHelper: THREE.GridHelper;

    constructor(scene: Scene) {
        this.gridHelper = new THREE.GridHelper(10, 10);
        this.gridHelper.position.y = -0.5;
        scene.add(this.gridHelper);
    }
}

class MyObject3D {
    public object: THREE.Object3D;

    constructor(scene: Scene) {
        this.object = new THREE.Object3D();
        this.object.position.x = Math.random() * 4 - 2;
        this.object.position.z = Math.random() * 4 - 2;
        scene.add(this.object);
    }
}

class StatsDisplay {
    private stats: Stats;

    constructor() {
        this.stats = new Stats();
        document.body.appendChild(this.stats.dom);
    }

    update() {
        this.stats.update();
    }
}

class GUIController {
    private gui: GUI;
    private object: THREE.Object3D;

    constructor(object: THREE.Object3D) {
        this.gui = new GUI();
        this.object = object;
        this.setup();
    }

    private setup() {
        const cubeFolder = this.gui.addFolder('Cube');
        const cubePositionFolder = cubeFolder.addFolder('Position');
        cubePositionFolder.add(this.object.position, 'x', -5, 5);
        cubePositionFolder.add(this.object.position, 'z', -5, 5);
        cubePositionFolder.open();

        const cubeRotationFolder = cubeFolder.addFolder('Rotation');
        cubeRotationFolder.add(this.object.rotation, 'x', 0, Math.PI * 2, 0.01);
        cubeRotationFolder.add(this.object.rotation, 'y', 0, Math.PI * 2, 0.01);
        cubeRotationFolder.add(this.object.rotation, 'z', 0, Math.PI * 2, 0.01);
        cubeRotationFolder.open();

        cubeFolder.open();
    }
}

class SocketHandler {
    private socket: Socket;
    private clientCubes: { [id: string]: THREE.Mesh } = {};
    private positions: { [id: string]: THREE.Vector3 } = {};
    private quaternions: { [id: string]: THREE.Quaternion } = {};
    private myId: string = '';
    private timestamp: number = 0;
    private scene: Scene;
    private geometry: THREE.BoxGeometry;
    private material: THREE.MeshBasicMaterial;
    private object: THREE.Object3D;

    constructor(scene: Scene, object: THREE.Object3D) {
        this.socket = io();
        this.scene = scene;
        this.object = object;
        this.geometry = new THREE.BoxGeometry();
        this.material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });

        this.setupSocketEvents();
    }

    private setupSocketEvents() {
        this.socket.on('connect', () => console.log('connect'));
        this.socket.on('disconnect', (message: any) => console.log('disconnect ' + message));

        this.socket.on('id', (id: any) => {
            this.myId = id;
            setInterval(() => {
                this.socket.emit('update', {
                    t: Date.now(),
                    p: this.object.position,
                    q: this.object.quaternion,
                });
            }, 50);
        });

        this.socket.on('clients', (clients: any) => this.handleClients(clients));
        this.socket.on('removeClient', (id: string) => this.handleRemoveClient(id));
    }

    private handleClients(clients: any) {
        let pingStatsHtml = 'Socket Ping Stats<br/><br/>';

        Object.keys(clients).forEach((c) => {
            this.timestamp = Date.now();
            pingStatsHtml += c + ' ' + (this.timestamp - clients[c].t) + 'ms<br/>';

            if (!this.clientCubes[c]) {
                this.clientCubes[c] = new THREE.Mesh(this.geometry, this.material);
                this.clientCubes[c].name = c;
                this.scene.add(this.clientCubes[c]);
            } else {
                clients[c].p && (this.positions[c] = clients[c].p);
                clients[c].q && (this.quaternions[c] = new THREE.Quaternion(...clients[c].q));
            }
        });

        (document.getElementById('pingStats') as HTMLDivElement).innerHTML = pingStatsHtml;
    }

    private handleRemoveClient(id: string) {
        this.scene.remove(this.scene.instance.getObjectByName(id) as THREE.Object3D);
    }

    updateClientCubes() {
        Object.keys(this.clientCubes).forEach((c) => {
            this.positions[c] && this.clientCubes[c].position.lerp(this.positions[c], 0.1);
            this.quaternions[c] && this.clientCubes[c].quaternion.slerp(this.quaternions[c], 0.1);
        });
    }
}

class Main {
    private renderer: Renderer;
    private camera: Camera;
    private scene: Scene;
    private controls: Controls;
    private gridHelper: GridHelper;
    private myObject3D: MyObject3D;
    private statsDisplay: StatsDisplay;
    private guiController: GUIController;
    private socketHandler: SocketHandler;

    constructor() {
        this.renderer = new Renderer();
        this.camera = new Camera();
        this.scene = new Scene();
        this.controls = new Controls(this.camera.instance, this.renderer.domElement);
        this.gridHelper = new GridHelper(this.scene);
        this.myObject3D = new MyObject3D(this.scene);
        this.statsDisplay = new StatsDisplay();
        this.guiController = new GUIController(this.myObject3D.object);
        this.socketHandler = new SocketHandler(this.scene, this.myObject3D.object);

        window.addEventListener('resize', () => this.onWindowResize(), false);

        this.animate();
    }

    private onWindowResize() {
        this.renderer.resize(this.camera.instance);
        this.render();
    }

    private animate() {
        requestAnimationFrame(() => this.animate());

        this.controls.update();
        this.socketHandler.updateClientCubes();
        this.render();
        this.statsDisplay.update();
    }

    private render() {
        this.renderer.render(this.scene.instance, this.camera.instance);
    }
}

new Main();
