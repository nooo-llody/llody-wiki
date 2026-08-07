
(function() {

    const panel = document.getElementById('customPanel');
    const toggleBtn = document.getElementById('togglePanel');
    const closeBtn = document.getElementById('closePanelBtn');

    const bgColor = document.getElementById('bgColor');
    const textColor = document.getElementById('textColor');
    const headingColor = document.getElementById('headingColor');
    const primaryColor = document.getElementById('primaryColor');
    const accentColor = document.getElementById('accentColor');
    const borderColor = document.getElementById('borderColor');
    const fontSize = document.getElementById('fontSize');
    const borderRadius = document.getElementById('borderRadius');

    const bgDisplay = document.getElementById('bgDisplay');
    const textDisplay = document.getElementById('textDisplay');
    const headingDisplay = document.getElementById('headingDisplay');
    const primaryDisplay = document.getElementById('primaryDisplay');
    const accentDisplay = document.getElementById('accentDisplay');
    const borderDisplay = document.getElementById('borderDisplay');
    const fontSizeDisplay = document.getElementById('fontSizeDisplay');
    const radiusDisplay = document.getElementById('radiusDisplay');

    const resetBtn = document.getElementById('resetCustom');

    function setCSSVar(variable, value, displayEl) {
        document.documentElement.style.setProperty(variable, value);
        if (displayEl) displayEl.textContent = value;
    }

    function syncColorInput(input, displayEl, varName) {
        setCSSVar(varName, input.value, displayEl);
    }

    function syncRangeInput(input, displayEl, varName, suffix = 'px') {
        setCSSVar(varName, input.value + suffix, displayEl);
    }

    function applyAll() {
        syncColorInput(bgColor, bgDisplay, '--bg');
        syncColorInput(textColor, textDisplay, '--text');
        syncColorInput(headingColor, headingDisplay, '--heading');
        syncColorInput(primaryColor, primaryDisplay, '--primary');
        syncColorInput(accentColor, accentDisplay, '--accent');
        syncColorInput(borderColor, borderDisplay, '--border');
        syncRangeInput(fontSize, fontSizeDisplay, '--font-size', 'px');
        syncRangeInput(borderRadius, radiusDisplay, '--border-radius', 'px');
    }

    function saveSettings() {
        localStorage.setItem('customTheme', JSON.stringify({
            bg: bgColor.value,
            text: textColor.value,
            heading: headingColor.value,
            primary: primaryColor.value,
            accent: accentColor.value,
            border: borderColor.value,
            fontSize: fontSize.value,
            borderRadius: borderRadius.value
        }));
    }

    function loadSettings() {
        const saved = localStorage.getItem('customTheme');
        if (!saved) return false;
        try {
            const s = JSON.parse(saved);
            bgColor.value = s.bg || '#f7f9fc';
            textColor.value = s.text || '#1a2332';
            headingColor.value = s.heading || '#0a1220';
            primaryColor.value = s.primary || '#3b7fbd';
            accentColor.value = s.accent || '#1f5a8e';
            borderColor.value = s.border || '#c0cfde';
            fontSize.value = s.fontSize || '16';
            borderRadius.value = s.borderRadius || '6';
            applyAll();
            return true;
        } catch (_) { return false; }
    }

    function resetToDefault() {
        const d = {
            bg: '#f7f9fc',
            text: '#1a2332',
            heading: '#0a1220',
            primary: '#3b7fbd',
            accent: '#1f5a8e',
            border: '#c0cfde',
            fontSize: '16',
            borderRadius: '6'
        };
        bgColor.value = d.bg;
        textColor.value = d.text;
        headingColor.value = d.heading;
        primaryColor.value = d.primary;
        accentColor.value = d.accent;
        borderColor.value = d.border;
        fontSize.value = d.fontSize;
        borderRadius.value = d.borderRadius;
        applyAll();
        localStorage.removeItem('customTheme');
    }

    const colorInputs = [bgColor, textColor, headingColor, primaryColor, accentColor, borderColor];
    const colorDisplays = [bgDisplay, textDisplay, headingDisplay, primaryDisplay, accentDisplay, borderDisplay];
    const colorVars = ['--bg', '--text', '--heading', '--primary', '--accent', '--border'];
    colorInputs.forEach((input, idx) => {
        input.addEventListener('input', function() {
            syncColorInput(this, colorDisplays[idx], colorVars[idx]);
            saveSettings();
        });
    });

    fontSize.addEventListener('input', function() {
        syncRangeInput(this, fontSizeDisplay, '--font-size', 'px');
        saveSettings();
    });
    borderRadius.addEventListener('input', function() {
        syncRangeInput(this, radiusDisplay, '--border-radius', 'px');
        saveSettings();
    });

    resetBtn.addEventListener('click', resetToDefault);

    if (toggleBtn) {
        toggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            panel.classList.toggle('open');
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            panel.classList.remove('open');
        });
    }
    document.addEventListener('click', function(e) {
        if (!panel.contains(e.target) && e.target !== toggleBtn) {
            panel.classList.remove('open');
        }
    });
    panel.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    const hasSaved = loadSettings();
    if (!hasSaved) applyAll();
})();

// ===== 滚动隐藏/显示导航栏 =====
(function() {
    const navWrapper = document.getElementById('fixed-nav-wrapper');
    if (!navWrapper) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    function handleScroll() {
        const currentScrollY = window.scrollY;

        // 判断方向：向下滚动且不在顶部 -> 隐藏
        if (currentScrollY > lastScrollY && currentScrollY > 50) {
            // 向下滚动，且滚动距离超过50px（避免微小抖动）
            navWrapper.classList.add('hidden');
        } else {
            // 向上滚动或位于顶部 -> 显示
            navWrapper.classList.remove('hidden');
        }

        lastScrollY = currentScrollY;
        ticking = false;
    }

    // 使用 requestAnimationFrame 优化性能
    window.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(function() {
                handleScroll();
            });
            ticking = true;
        }
    });

    // 页面加载时，确保导航栏可见
    window.addEventListener('load', function() {
        navWrapper.classList.remove('hidden');
    });

    // 如果用户快速滚动到顶部，确保导航栏显示（备用）
    window.addEventListener('scroll', function() {
        if (window.scrollY === 0) {
            navWrapper.classList.remove('hidden');
        }
    });
})();

const topBtn = document.getElementById('backToTop');
if (topBtn) {
    window.addEventListener('scroll', function() {
        if (window.scrollY > 400) {
            topBtn.classList.add('show');
        } else {
            topBtn.classList.remove('show');
        }
    });
}


(function() {
    'use strict';

    // 当 DOM 加载完成后初始化所有时间线
    document.addEventListener('DOMContentLoaded', function() {
        // 找到页面上所有 .timeline 容器
        const timelines = document.querySelectorAll('.timeline');
        if (!timelines.length) return;

        // 为每个时间线独立创建观察器
        timelines.forEach(function(timeline) {
            const items = timeline.querySelectorAll('.timeline-item');
            if (!items.length) return;

            const observer = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('show');
                        // 如果想只触发一次，可以取消观察
                        // observer.unobserve(entry.target);
                    }
                });
            }, {
                threshold: 0.3,
                rootMargin: '0px'
            });

            items.forEach(function(item) {
                observer.observe(item);
            });
        });
    });

})();