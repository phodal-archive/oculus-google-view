/**
 * @author troffmo5 / http://github.com/troffmo5
 *
 * Google Street View viewer for the Oculus Rift
 */

var QUALITY = 3;
var DEFAULT_LOCATION = {lat: 41.902381, lng: 12.465522};
var USE_TRACKER = false;
var NAV_DELTA = 45;
var FAR = 1000;
var USE_DEPTH = true;

var WIDTH, HEIGHT;
var currHeading = 0;
var centerHeading = 0;

var headingVector = new THREE.Euler();
var clock = new THREE.Clock();

function angleRangeDeg(angle) {
    angle %= 360;
    if (angle < 0) angle += 360;
    return angle;
}

function deltaAngleDeg(a, b) {
    return Math.min(360 - (Math.abs(a - b) % 360), Math.abs(a - b) % 360);
}

var scene, camera, controls, projSphere, progBarContainer, progBar, renderer, effect, worldMap;
var panoLoader, panoDepthLoader, marker, currentLocation, gmap, svCoverage, geocoder;
var mouse = { x: 0, y: 0 }

function initWebGL() {
    // create scene
    scene = new THREE.Scene();

    // Create camera
    camera = new THREE.PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, FAR);
    camera.target = new THREE.Vector3(1, 0, 0);

    controls = new THREE.DK2Controls(camera);

    scene.add(camera);

    // Add projection sphere
    projSphere = new THREE.Mesh(new THREE.SphereGeometry(500, 512, 256, 0, Math.PI * 2, 0, Math.PI), new THREE.MeshBasicMaterial({
        map: THREE.ImageUtils.loadTexture('placeholder.jpg'),
        side: THREE.DoubleSide
    }));
    projSphere.geometry.dynamic = true;
    scene.add(projSphere);

    // Add Progress Bar
    progBarContainer = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.1), new THREE.MeshBasicMaterial({color: 0xaaaaaa}));
    progBarContainer.translateZ(-3);
    camera.add(progBarContainer);

    progBar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), new THREE.MeshBasicMaterial({color: 0x0000ff}));
    progBar.translateZ(0.2);
    progBarContainer.add(progBar);

    // Create render
    try {
        renderer = new THREE.WebGLRenderer();
    }
    catch (e) {
        alert('This application needs WebGL enabled!');
        return false;
    }

    renderer.autoClearColor = false;
    renderer.setSize(WIDTH, HEIGHT);

    effect = new THREE.OculusRiftEffect(renderer, {worldScale: 100});
    effect.setSize(window.innerWidth, window.innerHeight);

    var viewer = $('#viewer');
    viewer.append(renderer.domElement);
}

function initControls() {
    var viewer = $('#viewer');

    viewer.dblclick(function () {
        moveToNextPlace();
    });
}

function initPano() {
    panoLoader = new GSVPANO.PanoLoader();
    panoDepthLoader = new GSVPANO.PanoDepthLoader();
    panoLoader.setZoom(QUALITY);

    panoLoader.onProgress = function (progress) {
        if (progress > 0) {
            progBar.visible = true;
            progBar.scale = new THREE.Vector3(progress / 100.0, 1, 1);
        }
    };
    panoLoader.onPanoramaData = function (result) {
        progBarContainer.visible = true;
        progBar.visible = false;
        $('.mapprogress').show();
    };

    panoLoader.onNoPanoramaData = function (status) {
        //alert('no data!');
    };

    panoLoader.onPanoramaLoad = function () {
        var a = THREE.Math.degToRad(90 - panoLoader.heading);
        projSphere.quaternion.setFromEuler(new THREE.Euler(0, a, 0, 'YZX'));

        projSphere.material.wireframe = false;
        projSphere.material.map.needsUpdate = true;
        projSphere.material.map = new THREE.Texture(this.canvas);
        projSphere.material.map.needsUpdate = true;
        centerHeading = panoLoader.heading;

        progBarContainer.visible = false;
        progBar.visible = false;

        marker.setMap(null);
        marker = new google.maps.Marker({position: this.location.latLng, map: gmap});
        marker.setMap(gmap);

        $('.mapprogress').hide();

        if (window.history) {
            var newUrl = '?lat=' + this.location.latLng.lat() + '&lng=' + this.location.latLng.lng();
            newUrl += USE_TRACKER ? '&sock=' + escape(WEBSOCKET_ADDR.slice(5)) : '';
            newUrl += '&q=' + QUALITY;
            newUrl += '&s=' + $('#settings').is(':visible');
            newUrl += '&heading=' + currHeading;
            window.history.pushState('', '', newUrl);
        }

        panoDepthLoader.load(this.location.pano);
    };

    panoDepthLoader.onDepthLoad = function () {
        setSphereGeometry();
    };
}

function setSphereGeometry() {
    var geom = projSphere.geometry;
    var geomParam = geom.parameters;
    var depthMap = panoDepthLoader.depthMap.depthMap;
    var y, x, u, v, radius, i = 0;
    for (y = 0; y <= geomParam.heightSegments; y++) {
        for (x = 0; x <= geomParam.widthSegments; x++) {
            u = x / geomParam.widthSegments;
            v = y / geomParam.heightSegments;

            radius = USE_DEPTH ? Math.min(depthMap[y * 512 + x], FAR) : 500;

            var vertex = geom.vertices[i];
            vertex.x = -radius * Math.cos(geomParam.phiStart + u * geomParam.phiLength) * Math.sin(geomParam.thetaStart + v * geomParam.thetaLength);
            vertex.y = radius * Math.cos(geomParam.thetaStart + v * geomParam.thetaLength);
            vertex.z = radius * Math.sin(geomParam.phiStart + u * geomParam.phiLength) * Math.sin(geomParam.thetaStart + v * geomParam.thetaLength);
            i++;
        }
    }
    geom.verticesNeedUpdate = true;
}

function initGoogleMap() {
    currentLocation = new google.maps.LatLng(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng);

    var mapel = $('#map');
    mapel.on('mousemove', function (e) {
        e.stopPropagation();
    });
    gmap = new google.maps.Map(mapel[0], {
        zoom: 14,
        center: currentLocation,
        mapTypeId: google.maps.MapTypeId.HYBRID,
        streetViewControl: false
    });
    google.maps.event.addListener(gmap, 'click', function (event) {
        panoLoader.load(event.latLng);
    });

    google.maps.event.addListener(gmap, 'center_changed', function (event) {
    });
    google.maps.event.addListener(gmap, 'zoom_changed', function (event) {
    });
    google.maps.event.addListener(gmap, 'maptypeid_changed', function (event) {
    });

    svCoverage = new google.maps.StreetViewCoverageLayer();
    svCoverage.setMap(gmap);

    geocoder = new google.maps.Geocoder();

    marker = new google.maps.Marker({position: currentLocation, map: gmap});
    marker.setMap(gmap);
}

function moveToNextPlace() {
    var nextPoint = null;
    var minDelta = 360;
    var navList = panoLoader.links;
    for (var i = 0; i < navList.length; i++) {
        var delta = deltaAngleDeg(currHeading, navList[i].heading);
        if (delta < minDelta && delta < NAV_DELTA) {
            minDelta = delta;
            nextPoint = navList[i].pano;
        }
    }

    if (nextPoint) {
        panoLoader.load(nextPoint);
    }
}

function render() {
    effect.render(scene, camera);
}

function resize() {
    WIDTH = window.innerWidth;
    HEIGHT = window.innerHeight;

    renderer.setSize(WIDTH, HEIGHT);
    camera.projectionMatrix.makePerspective(60, WIDTH / HEIGHT, 1, 1100);
}

function loop() {
    requestAnimationFrame(loop);

    headingVector.setFromQuaternion(camera.quaternion, 'YZX');
    currHeading = angleRangeDeg(THREE.Math.radToDeg(-headingVector.y));

    controls.update(clock.getDelta());

    render(scene, camera);
}


function Map() {

    this.WIDTH       = window.innerWidth;
    this.HEIGHT      = window.innerHeight;

    this.VIEW_ANGLE  = 45;
    this.NEAR        = 0.1;
    this.FAR         = 10000;
    this.CAMERA_X    = 0;
    this.CAMERA_Y    = 1000;
    this.CAMERA_Z    = 500;
    this.CAMERA_LX   = 0;
    this.CAMERA_LY   = 0;
    this.CAMERA_LZ   = 0;

    this.geo;
    this.scene = {};
    this.renderer = {};
    this.projector = {};
    this.camera = {};
    this.stage = {};

    this.INTERSECTED = null;
}

Map.prototype = {

    init_d3: function() {

        geoConfig = function() {

            this.mercator = d3.geo.equirectangular();
            this.path = d3.geo.path().projection(this.mercator);

            var translate = this.mercator.translate();
            translate[0] = 500;
            translate[1] = 0;

            this.mercator.translate(translate);
            this.mercator.scale(200);
        }

        this.geo = new geoConfig();
    },

    init_tree: function() {

        if( Detector.webgl ){
            this.renderer = new THREE.WebGLRenderer({
                antialias : true
            });
            //this.renderer.setClearColorHex( 0xBBBBBB, 1 );
        } else {
            this.renderer = new THREE.CanvasRenderer();
        }

        this.renderer.setSize( this.WIDTH, this.HEIGHT );

        this.projector = new THREE.Projector();

        // append renderer to dom element
        $("#worldmap").append(this.renderer.domElement);

        // create a scene
        this.scene = new THREE.Scene();

        // put a camera in the scene
        this.camera = new THREE.PerspectiveCamera(this.VIEW_ANGLE, this.WIDTH / this.HEIGHT, this.NEAR, this.FAR);
        this.camera.position.x = this.CAMERA_X;
        this.camera.position.y = this.CAMERA_Y;
        this.camera.position.z = this.CAMERA_Z;
        this.camera.lookAt( { x: this.CAMERA_LX, y: 0, z: this.CAMERA_LZ} );
        this.scene.add(this.camera);
    },


    add_light: function(x, y, z, intensity, color) {
        var pointLight = new THREE.PointLight(color);
        pointLight.position.x = x;
        pointLight.position.y = y;
        pointLight.position.z = z;
        pointLight.intensity = intensity;
        this.scene.add(pointLight);
    },

    add_plain: function(x, y, z, color) {
        var planeGeo = new THREE.CubeGeometry(x, y, z);
        var planeMat = new THREE.MeshLambertMaterial({color: color});
        var plane = new THREE.Mesh(planeGeo, planeMat);

        // rotate it to correct position
        plane.rotation.x = -Math.PI/2;
        this.scene.add(plane);
    },

    add_countries: function(data) {

        var countries = [];
        var i, j;

        // convert to threejs meshes
        for (i = 0 ; i < data.features.length ; i++) {
            var geoFeature = data.features[i];
            var properties = geoFeature.properties;
            var feature = this.geo.path(geoFeature);

            // we only need to convert it to a three.js path
            var mesh = transformSVGPathExposed(feature);

            // add to array
            for (j = 0 ; j < mesh.length ; j++) {
                countries.push({"data": properties, "mesh": mesh[j]});
            }
        }

        // extrude paths and add color
        for (i = 0 ; i < countries.length ; i++) {

            // create material color based on average
            var material = new THREE.MeshPhongMaterial({
                color: this.getCountryColor(countries[i].data),
                opacity:0.5
            });

            // extrude mesh
            var shape3d = countries[i].mesh.extrude({
                amount: 1,
                bevelEnabled: false
            });

            // create a mesh based on material and extruded shape
            var toAdd = new THREE.Mesh(shape3d, material);

            //set name of mesh
            toAdd.name = countries[i].data.name;

            // rotate and position the elements
            toAdd.rotation.x = Math.PI/2;
            toAdd.translateX(-490);
            toAdd.translateZ(50);
            toAdd.translateY(20);

            // add to scene
            this.scene.add(toAdd);
        }
    },

    getCountryColor: function(data) {
        var multiplier = 0;

        for(i = 0; i < 3; i++) {
            multiplier += data.iso_a3.charCodeAt(i);
        }

        multiplier = (1.0/366)*multiplier;
        return multiplier*0xffffff;
    },

    setCameraPosition: function(x, y, z, lx, lz) {
        this.CAMERA_X = x;
        this.CAMERA_Y = y;
        this.CAMERA_Z = z;
        this.CAMERA_LX = lx;
        this.CAMERA_LZ = lz;
    },

    moveCamera: function() {
        var speed = 0.2;
        var target_x = (this.CAMERA_X - this.camera.position.x) * speed;
        var target_y = (this.CAMERA_Y - this.camera.position.y) * speed;
        var target_z = (this.CAMERA_Z - this.camera.position.z) * speed;

        this.camera.position.x += target_x;
        this.camera.position.y += target_y;
        this.camera.position.z += target_z;

        this.camera.lookAt( {x: this.CAMERA_LX, y: 0, z: this.CAMERA_LZ } );
    },

    animate: function() {

        if( this.CAMERA_X != this.camera.position.x ||
            this.CAMERA_Y != this.camera.position.y ||
            this.CAMERA_Z != this.camera.position.z) {
            this.moveCamera();
        }

        // find intersections
        var vector = new THREE.Vector3( mouse.x, mouse.y, 1 );
        this.projector.unprojectVector( vector, this.camera );
        var raycaster = new THREE.Ray( this.camera.position, vector.subSelf( this.camera.position ).normalize() );
        var intersects = raycaster.intersectObjects( this.scene.children );

        var objects = this.scene.children;

        if ( intersects.length > 1 ) {
            if(this.INTERSECTED != intersects[ 0 ].object) {
                if (this.INTERSECTED) {
                    for(i = 0; i < objects.length; i++) {
                        if (objects[i].name == this.INTERSECTED.name) {
                            objects[i].material.opacity = 0.5;
                            objects[i].scale.z = 1;
                        }
                    }
                    this.INTERSECTED = null;
                }
            }

            this.INTERSECTED = intersects[ 0 ].object;
            for(i = 0; i < objects.length; i++) {
                if (objects[i].name == this.INTERSECTED.name) {
                    objects[i].material.opacity = 1.0;
                    objects[i].scale.z = 5;
                }
            }

        } else if (this.INTERSECTED) {
            for(i = 0; i < objects.length; i++) {
                if (objects[i].name == this.INTERSECTED.name) {
                    objects[i].material.opacity = 0.5;
                    objects[i].scale.z = 1;
                }
            }
            this.INTERSECTED = null;
        }

        this.render();
    },

    render: function() {

        // actually render the scene
        this.renderer.render(this.scene, this.camera);
    }
};

$(document).ready(function () {
    WIDTH = window.innerWidth;
    HEIGHT = window.innerHeight;

    //initWebGL();
    //initControls();
    //initPano();

    $.when(	$.getJSON("data/countries.json") ).then(function(data){
        worldMap = new Map();

        worldMap.init_d3();
        worldMap.init_tree();

        worldMap.add_light(0, 3000, 0, 1.0, 0xFFFFFF);
        worldMap.add_plain(1400, 700, 30, 0xEEEEEE);

        worldMap.add_countries(data);

        var onFrame = window.requestAnimationFrame;

        function tick(timestamp) {
            worldMap.animate();

            if(worldMap.INTERSECTED) {
                $('#country-name').html(worldMap.INTERSECTED.name);
            } else {
                $('#country-name').html("move mouse over map");
            }

            onFrame(tick);
        }

        onFrame(tick);
    });

    //initGoogleMap();

    //panoLoader.load(new google.maps.LatLng(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng));
    //loop();
});
