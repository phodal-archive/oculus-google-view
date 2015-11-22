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

function angleRangeDeg(angle) {
    angle %= 360;
    if (angle < 0) angle += 360;
    return angle;
}

function deltaAngleDeg(a, b) {
    return Math.min(360 - (Math.abs(a - b) % 360), Math.abs(a - b) % 360);
}

var scene, camera, controls, projSphere, progBarContainer, progBar, renderer,effect;
var panoLoader, panoDepthLoader, marker, currentLocation, gmap, svCoverage, geocoder;

function initWebGL() {
    // create scene
    scene = new THREE.Scene();

    // Create camera
    camera = new THREE.PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, FAR);
    camera.target = new THREE.Vector3(1, 0, 0);

    //controls = new THREE.DK2Controls(camera);
    controls  = new THREE.VRControls(camera);

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

    controls.update();
    render();
}

$(document).ready(function () {
    WIDTH = window.innerWidth;
    HEIGHT = window.innerHeight;

    initWebGL();
    initControls();
    initPano();
    initGoogleMap();

    panoLoader.load(new google.maps.LatLng(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng));
    loop();
});
