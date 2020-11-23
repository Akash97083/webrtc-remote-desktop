let peerConnection = null;
let dataChannel = null;

let resolutionMap = {
  screenWidth: 0,
  screenHeight: 0,
  canvasWidth: 0,
  canvasHeight: 0,
};

let currentRemoteMousePos = {
  x: 0,
  y: 0
}

let lastTouchMousePos = {
  x: 0,
  y: 0
}

let canvasElement = 'screen-canvas'
let touchCanvas = 'touch-canvas'
let videoElement = 'screen-video'


function showError (error) {
  const errorNode = document.querySelector("#error");
  if (errorNode.firstChild) {
    errorNode.removeChild(errorNode.firstChild);
  }
  errorNode.appendChild(document.createTextNode(error.message || error));
}

function startSession (offer, screen) {
  return fetch("/api/session", {
    method: "POST",
    body: JSON.stringify({
      offer,
      screen,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((res) => {
      return res.json();
    })
    .then((msg) => {
      return msg.answer;
    });
}

function createOffer (pc, { audio, video }) {
  return new Promise((accept, reject) => {
    pc.onicecandidate = (evt) => {
      if (!evt.candidate) {
        // ICE Gathering finished
        const { sdp: offer } = pc.localDescription;
        accept(offer);
      }
    };
    pc.createOffer({
      offerToReceiveAudio: audio,
      offerToReceiveVideo: video,
    })
      .then((ld) => {
        pc.setLocalDescription(ld);
      })
      .catch(reject);
  });
}

function sendDataMessage (command, data) {
  if (dataChannel) {
    // Send cordinates
    dataChannel.send(
      JSON.stringify({
        command: command,
        data: data,
      })
    );
  }
}

function enableMouseEvents (dataChannel) {
  // Start sending mouse cordinates on mouse move in canvas
  const canvas = (isMobileDevice()) ? document.getElementById(touchCanvas) : document.getElementById(canvasElement);

  // On Mouse move
  if (!isMobileDevice()) {
    canvas.addEventListener("mousemove", (event) => {

      // Get cordinates
      const cordinates = scaleCordinatesForDesktop(event.clientX, event.clientY);

      // Send cordinates
      sendDataMessage("mousemove", {
        x: cordinates.x,
        y: cordinates.y,
      });
    });
  }

  // On Mouse Click
  canvas.addEventListener("mousedown", (event) => {
    let button = "left";

    switch (event.which) {
      case 1:
        button = "left";
        break;

      case 2:
        button = "center";
        break;

      case 3:
        button = "right";
        break;

      default:
        button = "left";
    }

    sendDataMessage("click", {
      button,
    });
  });

  // On Mouse Double Click
  canvas.addEventListener("dblclick", (event) => {
    let button = "left";

    switch (event.which) {
      case 1:
        button = "left";
        break;

      case 2:
        button = "center";
        break;

      case 3:
        button = "right";
        break;

      default:
        button = "left";
    }

    sendDataMessage("dblclick", {
      button,
    });
  });

  // On Mouse Scroll
  canvas.addEventListener("wheel", (event) => {
    const delta = Math.sign(event.deltaY);
    const direction = delta > 0 ? "down" : "up";
    sendDataMessage("mousescroll", {
      direction,
    });
  });

  /** TOUCH EVENTS */
  // On Touch start
  canvas.addEventListener('touchstart', (event) => {

    lastTouchMousePos.x = event.touches[0].clientX
    lastTouchMousePos.y = event.touches[0].clientY

    switch (event.touches.length) {
      // case 1:
      //   sendDataMessage("click", {
      //     button: 'left'
      //   })
      //   break

      case 2:
        sendDataMessage("click", {
          button: 'right'
        })
        break

      case 3:
        console.log('Triple touch')
        break

      default:
        console.log('Not supported gesture')
    }
  });

  // On touch move
  canvas.addEventListener('touchmove', event => {

    // Get cordinates
    var touch = event.touches[0];
    const x = (touch.clientX - lastTouchMousePos.x).toFixed(0);
    const y = (touch.clientY - lastTouchMousePos.y).toFixed(0);
    lastTouchMousePos.x = touch.clientX;
    lastTouchMousePos.y = touch.clientY;

    // Send cordinates
    sendDataMessage("mousetouchmove", {
      x: x,
      y: y,
    });
  });

  // On touch cancel
  canvas.addEventListener('touchcancel', event => {
    console.log('Touch cancel')
  });

  // On touch end
  canvas.addEventListener('touchend', event => {
    console.log('Touch end')
  });

  /** DOCUMENT LEVEL EVENT LISTENERS */
  // Read keyboard events
  document.addEventListener("keydown", (event) => {
    sendDataMessage("keydown", {
      keyCode: event.keyCode,
    });
  });
}

function touchLeftClick () {
  sendDataMessage("click", {
    button: 'left'
  })
}

function touchRightClick () {
  sendDataMessage("click", {
    button: 'right'
  })
}

function drawMousePointer () {
  const remoteCanvas = document.getElementById(canvasElement);
  const context = remoteCanvas.getContext('2d');
  const pointer = new Image();
  pointer.src = '/static/img/pointer.png';

  const repaint = function () {
    context.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
    const localPoints = scaleRemoteCordinatesToLocalDisplay()
    context.drawImage(pointer, localPoints.x, localPoints.y, 12, 18);
  }

  pointer.onload = () => requestAnimationFrame(repaint)
}

function scaleRemoteCordinatesToLocalDisplay () {

  // Calculate remote position in percent
  const xPer = (currentRemoteMousePos.x / resolutionMap.screenWidth) * 100
  const yPer = (currentRemoteMousePos.y / resolutionMap.screenHeight) * 100

  // Calculate local position
  const localX = ((resolutionMap.canvasWidth * xPer) / 100).toFixed(0)
  const localY = ((resolutionMap.canvasHeight * yPer) / 100).toFixed(0)

  return {
    x: localX,
    y: localY
  }
}

function scaleCordinatesForDesktop (posX, posY) {
  const remoteCanvas = document.getElementById(canvasElement);
  // Get canvas size
  const rect = remoteCanvas.getBoundingClientRect();
  // Get mouse cordinates on canvas
  const x = (posX - rect.left).toFixed(0);
  const y = (posY - rect.top).toFixed(0);
  // Calculate screen percentage based on canvas
  const xPer = (x / resolutionMap.canvasWidth) * 100;
  const yPer = (y / resolutionMap.canvasHeight) * 100;
  // Map percentage to original screen
  return {
    x: ((resolutionMap.screenWidth * xPer) / 100).toFixed(0),
    y: ((resolutionMap.screenHeight * yPer) / 100).toFixed(0),
  };
}

function startRemoteSession (screen, remoteVideoNode, stream) {
  let pc;

  return Promise.resolve()
    .then(() => {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      dataChannel = pc.createDataChannel("messages");

      dataChannel.onopen = function (event) {
        enableMouseEvents(dataChannel);

        // Fetch screen size from server
        sendDataMessage("screensize", {});
      };

      dataChannel.onmessage = function (event) {
        try {
          const message = JSON.parse(event.data);
          switch (message.command) {
            case "screensize":
              resolutionMap.screenHeight = message.data.height;
              resolutionMap.screenWidth = message.data.width;
              currentRemoteMousePos.x = message.data.mouseX
              currentRemoteMousePos.y = message.data.mouseY
              // drawMousePointer()
              break;

            case "mousetouchmove":
              currentRemoteMousePos.x = message.data.x
              currentRemoteMousePos.y = message.data.y
              // drawMousePointer()
              break;
          }
        } catch (e) {
          console.error(e);
        }
      };

      pc.ontrack = (evt) => {
        remoteVideoNode.srcObject = evt.streams[0];
        remoteVideoNode.play();
      };

      stream &&
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

      return createOffer(pc, { audio: false, video: true });
    })
    .then((offer) => {
      return startSession(offer, screen);
    })
    .then((answer) => {
      return pc.setRemoteDescription(
        new RTCSessionDescription({
          sdp: answer,
          type: "answer",
        })
      );
    })
    .then(() => pc);
}

function resizeCanvas (canvas, video) {
  const w = video.offsetWidth;
  const h = video.offsetHeight;
  canvas.width = w;
  canvas.height = h;

  resolutionMap.canvasHeight = h;
  resolutionMap.canvasWidth = w;
}

function disconnectSession () {
  sendDataMessage("terminate", {});
  peerConnection.close();
  peerConnection = null;
  dataChannel = null;
  enableStartStop(true);
  setStartStopTitle("Connect");
}

const enableStartStop = (enabled) => {
  const startStop = document.querySelector("#start-stop");
  if (enabled) {
    startStop.removeAttribute("disabled");
  } else {
    startStop.setAttribute("disabled", "");
  }
};

const setStartStopTitle = (title) => {
  const startStop = document.querySelector("#start-stop");
  startStop.removeChild(startStop.firstChild);
  startStop.appendChild(document.createTextNode(title));
};

function getBrowser () {
  // Opera 8.0+
  if ((!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0) return 'opera'

  // Firefox 1.0+
  if (typeof InstallTrigger !== 'undefined') return 'firefox'

  // Safari 3.0+ "[object HTMLElementConstructor]" 
  if (/constructor/i.test(window.HTMLElement) || (function (p) { return p.toString() === "[object SafariRemoteNotification]"; })(!window['safari'] || (typeof safari !== 'undefined' && safari.pushNotification))) return 'safari'

  // Internet Explorer 6-11
  if (/*@cc_on!@*/false || !!document.documentMode) return 'ie'

  // Edge 20+
  if (!(/*@cc_on!@*/false || !!document.documentMode) && !!window.StyleMedia) return 'edge'

  // Edge (based on chromium) detection
  if ((!!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime)) && (navigator.userAgent.indexOf("Edg") != -1)) return 'newedge'

  // Chrome 1 - 79
  if (!!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime)) return 'chrome'
}

function isMobileDevice () {
  return typeof window.orientation !== 'undefined'
}

document.addEventListener("DOMContentLoaded", () => {
  let selectedScreen = 0;
  const remoteVideo = document.getElementById(videoElement);
  const remoteCanvas = document.getElementById(canvasElement);

  if (isMobileDevice()) {
    document.getElementById('touch-container').style.display = 'block'
  }

  // Disable right click context on canvas
  remoteCanvas.oncontextmenu = function (e) {
    e.preventDefault();
  };

  const startStop = document.querySelector("#start-stop");

  remoteVideo.onplaying = () => {
    setInterval(() => {
      resizeCanvas(remoteCanvas, remoteVideo);
    }, 1000);
  };

  startStop.addEventListener("click", () => {
    enableStartStop(false);

    const browser = getBrowser()

    const userMediaPromise = (browser === "safari")
      ? navigator.mediaDevices.getUserMedia({ video: true })
      : Promise.resolve(null)

    if (!peerConnection) {
      userMediaPromise.then((stream) => {
        return startRemoteSession(selectedScreen, remoteVideo, stream)
          .then((pc) => {
            remoteVideo.style.setProperty("visibility", "visible");
            peerConnection = pc;
          })
          .catch(showError)
          .then(() => {
            enableStartStop(true);
            setStartStopTitle("Disconnect");
            document.getElementById('instruction').style.display = 'none'
          });
      });
    } else {
      disconnectSession();
      document.getElementById('instruction').style.display = 'block'
      remoteVideo.style.setProperty("visibility", "collapse");
    }
  });
});

window.addEventListener("beforeunload", () => {
  if (peerConnection) {
    peerConnection.close();
  }
});
