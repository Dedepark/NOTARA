/* ── PRINT BUTTON ── */
document
	.getElementById("print-btn")
	.addEventListener("click", () => window.print());

/* ── COUPON RANDOM ROTATIONS ── */
document.querySelectorAll(".cp").forEach((cp, i) => {
	const tilt = (Math.random() - 0.5) * 1.8;
	cp.style.transform = `rotate(${tilt}deg)`;
	cp.dataset.tilt = tilt;
});

/* ── SANDWICH ITEM HOVER: tilt slightly ── */
document.querySelectorAll(".sw").forEach((sw) => {
	sw.addEventListener("mouseenter", () => {
		sw.style.transition = "transform 0.4s cubic-bezier(.16,1,.3,1)";
		sw.style.transform = "translateX(4px)";
	});
	sw.addEventListener("mouseleave", () => {
		sw.style.transform = "";
	});
});

/* ── BURST WIGGLES ON MOUSE NEAR ── */
const burst = document.querySelector(".float-burst");
window.addEventListener("mousemove", (e) => {
	const r = burst.getBoundingClientRect();
	const cx = r.left + r.width / 2;
	const cy = r.top + r.height / 2;
	const d = Math.hypot(e.clientX - cx, e.clientY - cy);
	if (d < 200) {
		const intensity = 1 - d / 200;
		burst.style.animationDuration = `${2.4 - intensity * 1.5}s`;
	} else {
		burst.style.animationDuration = "2.4s";
	}
});

/* ── EASTER EGG: TYPE "BIRD" ── */
let typed = "";
window.addEventListener("keydown", (e) => {
	typed = (typed + e.key.toLowerCase()).slice(-4);
	if (typed === "bird") {
		document.body.style.transition = "transform 0.8s cubic-bezier(.16,1,.3,1)";
		document.body.style.transform = "rotate(-2deg) scale(1.02)";
		setTimeout(() => {
			document.body.style.transform = "";
		}, 1400);
	}
});

/* ── REVEAL ON LOAD: stagger sandwich items ── */
const swItems = document.querySelectorAll(".sw");
swItems.forEach((sw, i) => {
	sw.style.opacity = "0";
	sw.style.transform = "translateY(15px)";
	sw.style.transition = `opacity 0.6s ${
		0.15 + i * 0.08
	}s cubic-bezier(.16,1,.3,1), transform 0.6s ${
		0.15 + i * 0.08
	}s cubic-bezier(.16,1,.3,1)`;
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			sw.style.opacity = "1";
			sw.style.transform = "translateY(0)";
		});
	});
});

/* ── LIVE-UPDATE THE SURF REPORT (just for fun) ── */
const surfStats = [
	"4-6 ft · CLEAN",
	"3-5 ft · GLASSY",
	"5-7 ft · FIRING",
	"2-4 ft · MELLOW"
];
let idx = 0;
setInterval(() => {
	idx = (idx + 1) % surfStats.length;
	const target = document.querySelector(
		".hero-meta div:first-child span:last-child"
	);
	if (target) {
		target.style.opacity = "0";
		setTimeout(() => {
			target.textContent = surfStats[idx];
			target.style.opacity = "1";
		}, 300);
	}
}, 4500);
