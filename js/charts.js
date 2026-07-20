/* js/charts.js — Chart Helper Functions */
'use strict';
window.Notara = window.Notara || {};
window.Notara.Charts = (() => {
  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function drawBarChart(canvas, config) {
    if (!canvas || !config) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const labels = config.labels || [];
    const datasets = config.datasets || [];
    const barWidth = config.barWidth || 0.6;

    const padding = { top: 10, bottom: 30, left: 10, right: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const allVals = datasets.flatMap(ds => ds.values);
    const maxVal = Math.max(...allVals, 1);

    const text3 = getCSSVar('--text-3') || '#666';
    const groupW = chartW / labels.length;
    const singleBarW = (groupW * barWidth) / datasets.length;

    ctx.font = '600 9px var(--font-body, sans-serif)';
    ctx.textAlign = 'center';

    labels.forEach((label, i) => {
      const groupX = padding.left + i * groupW + groupW / 2;

      datasets.forEach((ds, j) => {
        const val = ds.values[i] || 0;
        const barH = (val / maxVal) * chartH;
        const x = groupX - (groupW * barWidth) / 2 + j * singleBarW;
        const y = padding.top + chartH - barH;

        ctx.fillStyle = ds.color || text3;
        ctx.beginPath();
        const r = 2;
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + singleBarW, y, x + singleBarW, y + barH, r);
        ctx.arcTo(x + singleBarW, y + barH, x, y + barH, r);
        ctx.arcTo(x, y + barH, x, y, r);
        ctx.arcTo(x, y, x + singleBarW, y, r);
        ctx.fill();
      });

      ctx.fillStyle = text3;
      ctx.fillText(label, groupX, h - 8);
    });
  }

  function drawLineChart(canvas, config) {
    if (!canvas || !config) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const labels = config.labels || [];
    const datasets = config.datasets || [];

    const padding = { top: 10, bottom: 30, left: 10, right: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const allVals = datasets.flatMap(ds => ds.values);
    const maxVal = Math.max(...allVals, 1);

    const text3 = getCSSVar('--text-3') || '#666';
    const gap = chartW / Math.max(labels.length - 1, 1);

    ctx.font = '600 9px var(--font-body, sans-serif)';
    ctx.textAlign = 'center';

    datasets.forEach(ds => {
      ctx.strokeStyle = ds.color || text3;
      ctx.lineWidth = 2;
      ctx.beginPath();

      ds.values.forEach((val, i) => {
        const x = padding.left + i * gap;
        const y = padding.top + chartH - (val / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ds.values.forEach((val, i) => {
        const x = padding.left + i * gap;
        const y = padding.top + chartH - (val / maxVal) * chartH;
        ctx.fillStyle = ds.color || text3;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    labels.forEach((label, i) => {
      const x = padding.left + i * gap;
      ctx.fillStyle = text3;
      ctx.fillText(label, x, h - 8);
    });
  }

  return { drawBarChart, drawLineChart, getCSSVar };
})();
