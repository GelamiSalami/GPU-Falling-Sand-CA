
(function() {

function createShader(gl, type, source) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);

	if (!success) {
		console.log(gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return undefined;
	}
	return shader;
}

function createProgram(gl, vertShader, fragShader) {
	const program = gl.createProgram();
	gl.attachShader(program, vertShader);
	gl.attachShader(program, fragShader);
	gl.linkProgram(program);

	const success = gl.getProgramParameter(program, gl.LINK_STATUS);
	if (!success) {
		console.log(gl.getProgramInfoLog(program));
		gl.deleteProgram(program);
		return undefined;
	}
	return program;
}

function createProgramFromString(gl, vertexShaderString, fragmentShaderString) {

	const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderString);
	const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderString);

	return createProgram(gl, vertexShader, fragmentShader);
}

function resizeCanvasToDisplaySize(canvas, pixelRatio) {
	pixelRatio = pixelRatio || 1;
	const width  = canvas.clientWidth * pixelRatio | 0;
	const height = canvas.clientHeight * pixelRatio | 0;
	if (canvas.width !== width ||  canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
		return true;
	}
	return false;
}

function mod(x, y) {
	return x - y * Math.floor(x / y);
}

function fract(x) {
	return x - Math.floor(x);
}

function clamp(x, xmin, xmax) {
	return Math.min(Math.max(x, xmin), xmax);
}

function hashi(x)
{
	x ^= x >> 16;
	x *= 0x7feb352d;
	x ^= x >> 15;
	x *= 0x846ca68b;
	x ^= x >> 16;
	return x;
}

function hashf(p)
{
	p = fract(p * .1031);
	p *= p + 323.333;
	p *= p + p;
	return fract(p);
}

const title = document.getElementById("title");

const urlParams = new URLSearchParams(window.location.search);

if (!urlParams.has("header")) {
	title.style.display = "none";
}

const container = document.getElementById("canvas-container");
const canvas = document.getElementById("main-canvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
	console.error("WebGL2 context not available!");
}

if (!gl.getExtension('EXT_color_buffer_float')) {
	console.error('need EXT_color_buffer_float');
}

if (!gl.getExtension('OES_texture_float_linear')) {
	console.error('need OES_texture_float_linear');
}

const program = createProgramFromString(gl, vsText, fsText);
const blitProgram = createProgramFromString(gl, vsText, renderShaderText);
const jfaShadowProgram = createProgramFromString(gl, vsText, jfaShaderText);
const jfaInitProgram = createProgramFromString(gl, vsText, jfaInitShaderText);

const quad = [
	-1.0, -1.0, 0.0, 0.0,
	-1.0,  1.0, 0.0, 1.0,
	 1.0,  1.0, 1.0, 1.0,
	 1.0, -1.0, 1.0, 0.0
];

const posBuffer = gl.createBuffer();

gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quad), gl.STATIC_DRAW);

const vao = gl.createVertexArray();

gl.bindVertexArray(vao);

const posAttribLoc = gl.getAttribLocation(program, "aPosition");
const uvAttribLoc = gl.getAttribLocation(program, "aUv");

gl.vertexAttribPointer(posAttribLoc, 2, gl.FLOAT, false, 16, 0);
gl.enableVertexAttribArray(posAttribLoc);

gl.vertexAttribPointer(uvAttribLoc, 2, gl.FLOAT, false, 16, 8);
gl.enableVertexAttribArray(uvAttribLoc);

resizeCanvasToDisplaySize(gl.canvas);
gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

const SCALE = 10;

let bufferWidth = Math.ceil(gl.canvas.width / SCALE);
let bufferHeight = Math.ceil(gl.canvas.height / SCALE);

const fbo = [null, null];
const tex = [null, null];

for (let i = 0; i < 2; i++) {

	tex[i] = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, tex[i]);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bufferWidth, bufferHeight, 0, gl.RGBA, gl.FLOAT, null);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	fbo[i] = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[i]);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex[i], 0);
}

let shadowSwap = 0;
const shadowFbo = [null, null];
const shadowTexR = [null, null];
const shadowTexG = [null, null];
const shadowTexB = [null, null];

for (let i = 0; i < 2; i++) {

	shadowTexR[i] = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, shadowTexR[i]);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bufferWidth, bufferHeight, 0, gl.RGBA, gl.FLOAT, null);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	shadowTexG[i] = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, shadowTexG[i]);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bufferWidth, bufferHeight, 0, gl.RGBA, gl.FLOAT, null);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	shadowTexB[i] = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, shadowTexB[i]);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bufferWidth, bufferHeight, 0, gl.RGBA, gl.FLOAT, null);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	shadowFbo[i] = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo[i]);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTexR[i], 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, shadowTexG[i], 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, shadowTexB[i], 0);

	gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
}

console.log(`Screen size: ${gl.canvas.width}, ${gl.canvas.height}`);
console.log(`Buffer size: ${bufferWidth}, ${bufferHeight}`);

let mouse = {
	x: -1, y: -1,
	px: -1, py: -1,
	pressed: false
};

let materialType = 5;
let brushRadius = 1;
let minBrushRadius = 0.5;
let maxBrushRadius = 5;
let paused = false;

function mouseMoved(event) {
	let x = event.clientX != null ? event.clientX : event.touches[0].clientX;
	let y = event.clientY != null ? event.clientY : event.touches[0].clientY;
	let rect = canvas.getBoundingClientRect();
	mouse.x = x - rect.left;
	mouse.y = y - rect.top;
}

function mousePressed(event) {
	let x = event.clientX != null ? event.clientX : event.touches[0].clientX;
	let y = event.clientY != null ? event.clientY : event.touches[0].clientY;
	let rect = canvas.getBoundingClientRect();
	mouse.x = x - rect.left;
	mouse.y = y - rect.top;
	mouse.px = mouse.x;
	mouse.py = mouse.y;
	mouse.pressed = true;
}

function mouseReleased(event) {
	mouse.pressed = false;
}

container.addEventListener("mousemove", mouseMoved);
container.addEventListener("touchmove", mouseMoved);

container.addEventListener("mousedown", mousePressed);
container.addEventListener("touchstart", mousePressed);

container.addEventListener("mouseup", mouseReleased);
container.addEventListener("touchend", mouseReleased);

container.addEventListener("mouseleave", mouseReleased);
container.addEventListener("touchleave", mouseReleased);

const buttons = document.querySelectorAll("#material-buttons ul li a");

buttons[materialType].classList.add("selected");

function setMaterialType(type) {
	if (buttons[materialType].classList.contains("selected")) {
		buttons[materialType].classList.remove("selected");
	}
	materialType = clamp(type, 0, 7);
	if (!buttons[materialType].classList.contains("selected")) {
		buttons[materialType].classList.add("selected");
	}
}

buttons.forEach((button, idx) => {
	button.addEventListener("click", (e) => {
		e.preventDefault();
		setMaterialType(parseInt(button.getAttribute("data-type")));
	});
});

document.addEventListener("keydown", (e) => {
	if (e.keyCode >= 48 && e.keyCode <= 57) {
		setMaterialType(e.keyCode - 48);
	} else if (e.keyCode >= 96 && e.keyCode <= 105) {
		setMaterialType(e.keyCode - 96);
	}

	if (e.keyCode == 189 || e.keyCode == 109) {
		brushRadius = clamp(brushRadius - 0.5, minBrushRadius, maxBrushRadius);
	} else if (e.keyCode == 187 || e.keyCode == 107) {
		brushRadius = clamp(brushRadius + 0.5, minBrushRadius, maxBrushRadius);
	}

	if (e.keyCode == 32 || e.keyCode == 27) {
		paused = !paused;
	}
});

document.addEventListener("keyup", (e) => {
});

let swap = 0;
let frames = 0;
let demo = true;
let seed = Date.now();

function render(time) {

	let resized = false;
	if (resizeCanvasToDisplaySize(gl.canvas)) {
		resized = true;

		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

		bufferWidth = Math.ceil(gl.canvas.width / SCALE);
		bufferHeight = Math.ceil(gl.canvas.height / SCALE);

		for (let i = 0; i < 2; i++)
		{
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[i]);

			const newTex = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, newTex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bufferWidth, bufferHeight, 0, gl.RGBA, gl.FLOAT, null);

			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			gl.bindTexture(gl.TEXTURE_2D, newTex);
			gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, bufferWidth, bufferHeight);
			
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, newTex, 0);

			gl.deleteTexture(tex[i]);
			tex[i] = newTex;
		}

		for (let i = 0; i < 2; i++)
		{
			gl.bindTexture(gl.TEXTURE_2D, shadowTexR[i]);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bufferWidth, bufferHeight, 0, gl.RGBA, gl.FLOAT, null);
		
			gl.bindTexture(gl.TEXTURE_2D, shadowTexG[i]);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bufferWidth, bufferHeight, 0, gl.RGBA, gl.FLOAT, null);
		
			gl.bindTexture(gl.TEXTURE_2D, shadowTexB[i]);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bufferWidth, bufferHeight, 0, gl.RGBA, gl.FLOAT, null);
		}
	}

	if (!paused || mouse.pressed) {

		gl.useProgram(program);
		gl.bindVertexArray(vao);

		const timeLoc = gl.getUniformLocation(program, "time");
		const frameLoc = gl.getUniformLocation(program, "frame");
		const resLoc = gl.getUniformLocation(program, "resolution");
		const texLoc = gl.getUniformLocation(program, "tex");
		const mouseLoc = gl.getUniformLocation(program, "mouse");
		const mouseButtonsLoc = gl.getUniformLocation(program, "mouseButtons");
		const materialTypeLoc = gl.getUniformLocation(program, "materialType");
		const brushRadiusLoc = gl.getUniformLocation(program, "brushRadius");

		let mx = (mouse.x / gl.canvas.width) * bufferWidth;
		let my = (1.0 - mouse.y / gl.canvas.height) * bufferHeight;
		let mpx = (mouse.px / gl.canvas.width) * bufferWidth;
		let mpy = (1.0 - mouse.py / gl.canvas.height) * bufferHeight;

		let pressed = false;

		if (mouse.pressed)
			demo = false;

		if (demo && frames > 40) {
			if (frames < 1200) {
				let id = Math.ceil(frames / 40);
				let type = hashf(id + seed);
				let x = hashf(id + seed + 3.3);
				x += Math.sin(frames * 0.1) * 0.03;
				let y = hashf(id + seed + 5.3);
				type = Math.floor(type * 5.0 + 2.0);
				mx = clamp(x, 0.0, 1.0) * bufferWidth;
				my = (0.8 + y * 0.1) * bufferHeight;
				mpx = mx;
				mpy = my;
				pressed = true;
				setMaterialType(type);
			} else {
				demo = false;
			}
		}

		gl.uniform1f(timeLoc, time * 0.001);
		gl.uniform2f(resLoc, bufferWidth, bufferHeight);
		gl.uniform1i(materialTypeLoc, materialType);
		gl.uniform1f(brushRadiusLoc, brushRadius);

		if (mouse.pressed || pressed)
			gl.uniform4f(mouseLoc, mx, my, mpx, mpy);
		else
			gl.uniform4f(mouseLoc, -mx, -my, -mpx, -mpy);

		const PASSES = 3;
		for (let i = 0; i < PASSES; i++) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[swap]);
			gl.viewport(0, 0, bufferWidth, bufferHeight);

			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);

			gl.uniform1i(frameLoc, frames * PASSES + i);

			gl.uniform1i(texLoc, 0);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, tex[1 - swap]);

			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

			swap = 1 - swap;
		}

		frames++;
	}

	if (paused && !resized && !mouse.pressed) {
		requestAnimationFrame(render);
		return;
	}

	{
		shadowSwap = 0;

		gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo[shadowSwap]);
		gl.viewport(0, 0, bufferWidth, bufferHeight);

		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.useProgram(jfaInitProgram);
		gl.bindVertexArray(vao);

		const resLoc = gl.getUniformLocation(jfaInitProgram, "resolution");
		const texLoc = gl.getUniformLocation(jfaInitProgram, "dataTex");

		gl.uniform2f(resLoc, bufferWidth, bufferHeight);

		gl.uniform1i(texLoc, 0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, tex[swap]);

		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

		shadowSwap = 1 - shadowSwap;
	}

	{
		const JFA_PASSES = 4;

		gl.useProgram(jfaShadowProgram);

		const resLoc = gl.getUniformLocation(jfaShadowProgram, "resolution");
		const texLoc = gl.getUniformLocation(jfaShadowProgram, "texR");
		const texGLoc = gl.getUniformLocation(jfaShadowProgram, "texG");
		const texBLoc = gl.getUniformLocation(jfaShadowProgram, "texB");
		const stepSizeLoc = gl.getUniformLocation(jfaShadowProgram, "stepSize");
		const passCountLoc = gl.getUniformLocation(jfaShadowProgram, "passCount");
		const passIdxLoc = gl.getUniformLocation(jfaShadowProgram, "passIndex");

		gl.uniform2f(resLoc, bufferWidth, bufferHeight);
		gl.uniform1i(texLoc, 0);
		gl.uniform1i(texGLoc, 1);
		gl.uniform1i(texBLoc, 2);
		gl.uniform1i(passCountLoc, JFA_PASSES);

		for (let i = 0; i < JFA_PASSES; i++) {

			gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo[shadowSwap]);
			gl.viewport(0, 0, bufferWidth, bufferHeight);

			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);

			const stepSize = Math.pow(2, JFA_PASSES - i - 1);

			gl.uniform1f(stepSizeLoc, stepSize);
			gl.uniform1i(passIdxLoc, i);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, shadowTexR[1 - shadowSwap]);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, shadowTexG[1 - shadowSwap]);
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, shadowTexB[1 - shadowSwap]);

			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

			shadowSwap = 1 - shadowSwap;
		}
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.drawBuffers([gl.BACK]);
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	
	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.useProgram(blitProgram);
	gl.bindVertexArray(vao);

	const timeLoc = gl.getUniformLocation(blitProgram, "time");
	const resLoc = gl.getUniformLocation(blitProgram, "resolution");
	const texLoc = gl.getUniformLocation(blitProgram, "tex");
	const shadowTexLoc = gl.getUniformLocation(blitProgram, "shadowTexR");
	const shadowTexGLoc = gl.getUniformLocation(blitProgram, "shadowTexG");
	const shadowTexBLoc = gl.getUniformLocation(blitProgram, "shadowTexB");
	const scaleLoc = gl.getUniformLocation(blitProgram, "scale");
	const texResLoc = gl.getUniformLocation(blitProgram, "texResolution");
	const texScaleLoc = gl.getUniformLocation(blitProgram, "texScale");

	gl.uniform1f(timeLoc, time * 0.001);
	gl.uniform2f(resLoc, gl.canvas.width, gl.canvas.height);
	gl.uniform2f(texResLoc, bufferWidth, bufferHeight);
	gl.uniform1f(texScaleLoc, SCALE);
	gl.uniform1f(scaleLoc, 1.0);

	gl.uniform1i(texLoc, 0);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, tex[swap]);

	gl.uniform1i(shadowTexLoc, 1);
	gl.uniform1i(shadowTexGLoc, 2);
	gl.uniform1i(shadowTexBLoc, 3);
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, shadowTexR[1- shadowSwap]);
	gl.activeTexture(gl.TEXTURE2);
	gl.bindTexture(gl.TEXTURE_2D, shadowTexG[1- shadowSwap]);
	gl.activeTexture(gl.TEXTURE3);
	gl.bindTexture(gl.TEXTURE_2D, shadowTexB[1- shadowSwap]);

	gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

	mouse.px = mouse.x;
	mouse.py = mouse.y;

	requestAnimationFrame(render);
}

requestAnimationFrame(render);

})();