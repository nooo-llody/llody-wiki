/* ============================================================
   主题个性化 —— 全站通用（任何页面都能安全运行）
   ============================================================ */

   (function() {
    /* 辅助：安全获取元素 */
    const $ = (id) => document.getElementById(id);

    /* 辅助：安全绑定事件（元素不存在时静默跳过） */
    const on = (el, event, handler) => {
        if (el && typeof el.addEventListener === 'function') {
            el.addEventListener(event, handler);
        }
    };

    const panel = $('customPanel');
    const toggleBtn = $('togglePanel');
    const closeBtn = $('closePanelBtn');

    const bgColor = $('bgColor');
    const textColor = $('textColor');
    const headingColor = $('headingColor');
    const primaryColor = $('primaryColor');
    const accentColor = $('accentColor');
    const borderColor = $('borderColor');
    const fontSize = $('fontSize');
    const borderRadius = $('borderRadius');

    const bgDisplay = $('bgDisplay');
    const textDisplay = $('textDisplay');
    const headingDisplay = $('headingDisplay');
    const primaryDisplay = $('primaryDisplay');
    const accentDisplay = $('accentDisplay');
    const borderDisplay = $('borderDisplay');
    const fontSizeDisplay = $('fontSizeDisplay');
    const radiusDisplay = $('radiusDisplay');

    const resetBtn = $('resetCustom');

    function setCSSVar(variable, value, displayEl) {
        document.documentElement.style.setProperty(variable, value);
        if (displayEl) displayEl.textContent = value;
    }

    function syncColorInput(input, displayEl, varName) {
        if (!input) return;
        setCSSVar(varName, input.value, displayEl);
    }

    function syncRangeInput(input, displayEl, varName, suffix = 'px') {
        if (!input) return;
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
        const data = {};
        if (bgColor)       data.bg           = bgColor.value;
        if (textColor)     data.text         = textColor.value;
        if (headingColor)  data.heading      = headingColor.value;
        if (primaryColor)  data.primary      = primaryColor.value;
        if (accentColor)   data.accent       = accentColor.value;
        if (borderColor)   data.border       = borderColor.value;
        if (fontSize)      data.fontSize     = fontSize.value;
        if (borderRadius)  data.borderRadius = borderRadius.value;
        localStorage.setItem('customTheme', JSON.stringify(data));
    }

    function loadSettings() {
        const saved = localStorage.getItem('customTheme');
        if (!saved) return false;
        try {
            const s = JSON.parse(saved);
            if (bgColor      && s.bg)           bgColor.value = s.bg;
            if (textColor    && s.text)         textColor.value = s.text;
            if (headingColor && s.heading)      headingColor.value = s.heading;
            if (primaryColor && s.primary)      primaryColor.value = s.primary;
            if (accentColor  && s.accent)       accentColor.value = s.accent;
            if (borderColor  && s.border)       borderColor.value = s.border;
            if (fontSize     && s.fontSize)     fontSize.value = s.fontSize;
            if (borderRadius && s.borderRadius) borderRadius.value = s.borderRadius;
            applyAll();
            return true;
        } catch (_) { return false; }
    }

    function resetToDefault() {
        const d = {
            bg: '#f7f9fc', text: '#1a2332', heading: '#0a1220',
            primary: '#3b7fbd', accent: '#1f5a8e', border: '#c0cfde',
            fontSize: '16', borderRadius: '6',
        };
        if (bgColor)       bgColor.value = d.bg;
        if (textColor)     textColor.value = d.text;
        if (headingColor)  headingColor.value = d.heading;
        if (primaryColor)  primaryColor.value = d.primary;
        if (accentColor)   accentColor.value = d.accent;
        if (borderColor)   borderColor.value = d.border;
        if (fontSize)      fontSize.value = d.fontSize;
        if (borderRadius)  borderRadius.value = d.borderRadius;
        applyAll();
        localStorage.removeItem('customTheme');
    }

    /* 颜色输入绑定 */
    const colorInputs   = [bgColor, textColor, headingColor, primaryColor, accentColor, borderColor];
    const colorDisplays = [bgDisplay, textDisplay, headingDisplay, primaryDisplay, accentDisplay, borderDisplay];
    const colorVars     = ['--bg', '--text', '--heading', '--primary', '--accent', '--border'];

    colorInputs.forEach((input, idx) => {
        on(input, 'input', function() {
            syncColorInput(this, colorDisplays[idx], colorVars[idx]);
            saveSettings();
        });
    });

    /* 范围输入绑定 */
    on(fontSize, 'input', function() {
        syncRangeInput(this, fontSizeDisplay, '--font-size', 'px');
        saveSettings();
    });
    on(borderRadius, 'input', function() {
        syncRangeInput(this, radiusDisplay, '--border-radius', 'px');
        saveSettings();
    });

    /* 重置 */
    on(resetBtn, 'click', resetToDefault);

    /* 面板开关 */
    on(toggleBtn, 'click', function(e) {
        e.stopPropagation();
        if (panel) panel.classList.toggle('open');
    });
    on(closeBtn, 'click', function(e) {
        e.stopPropagation();
        if (panel) panel.classList.remove('open');
    });

    /* 点击空白处关闭面板 */
    document.addEventListener('click', function(e) {
        if (panel && !panel.contains(e.target) && e.target !== toggleBtn) {
            panel.classList.remove('open');
        }
    });
    if (panel) {
        panel.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    /* 初始化 */
    const hasSaved = loadSettings();
    if (!hasSaved) applyAll();
})();


/* ============================================================
   滚动隐藏 / 显示导航栏
   ============================================================ */
(function() {
    const navWrapper = document.getElementById('fixed-nav-wrapper');
    if (!navWrapper) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    function handleScroll() {
        const currentScrollY = window.scrollY;

        if (currentScrollY > lastScrollY && currentScrollY > 50) {
            navWrapper.classList.add('hidden');
        } else {
            navWrapper.classList.remove('hidden');
        }

        lastScrollY = currentScrollY;
        ticking = false;
    }

    window.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(function() {
                handleScroll();
            });
            ticking = true;
        }
    });

    window.addEventListener('load', function() {
        navWrapper.classList.remove('hidden');
    });

    window.addEventListener('scroll', function() {
        if (window.scrollY === 0) {
            navWrapper.classList.remove('hidden');
        }
    });
})();


/* ============================================================
   返回顶部按钮
   ============================================================ */
(function() {
    const topBtn = document.getElementById('backToTop');
    if (!topBtn) return;

    window.addEventListener('scroll', function() {
        if (window.scrollY > 400) {
            topBtn.classList.add('show');
        } else {
            topBtn.classList.remove('show');
        }
    });
})();


/* ============================================================
   时间线动画
   ============================================================ */
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        const timelines = document.querySelectorAll('.timeline');
        if (!timelines.length) return;

        timelines.forEach(function(timeline) {
            const items = timeline.querySelectorAll('.timeline-item');
            if (!items.length) return;

            const observer = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('show');
                    }
                });
            }, { threshold: 0.3, rootMargin: '0px' });

            items.forEach(function(item) {
                observer.observe(item);
            });
        });
    });
})();


/* ============================================================
   视频卡片：点击加载 B 站 iframe
   ============================================================ */
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        const cards = document.querySelectorAll('.video-card');
        if (!cards.length) return;

        cards.forEach(function(card) {
            const bvid = card.dataset.bvid;
            if (!bvid) return;

            card.addEventListener('click', function() {
                const wrapper = this.querySelector('.card-video-wrapper');
                if (!wrapper || wrapper.querySelector('iframe')) return;

                const iframe = document.createElement('iframe');
                iframe.src = `//player.bilibili.com/player.html?bvid=${bvid}&page=1&autoplay=1&high_quality=1&controls=1`;
                iframe.allow = 'autoplay; encrypted-media';
                iframe.allowFullscreen = true;
                wrapper.appendChild(iframe);
                wrapper.classList.add('playing');
            });
        });
    });
})();


/* ============================================================
   model-viewer 动画切换（只有页面里存在这些元素时才生效）
   ============================================================ */
(function() {
    const viewer = document.querySelector('model-viewer');
    const btnIdle = document.getElementById('btn-idle');

    if (!viewer || !btnIdle) return;   // 星系页面没有这些元素，直接跳过

    btnIdle.addEventListener('click', () => {
        if (typeof switchAnimation === 'function') {
            switchAnimation(viewer, 'idle');
        }
    });
    // 其他按钮同理...
})();

// 全兼容复制功能
async function copyToClipboard(textToCopy) {
    // 现代 API 尝试
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(textToCopy);
            return true;
        } catch (err) {
            console.warn('Clipboard API 失败，准备降级', err);
        }
    }

    // 传统 API 降级方案
    return new Promise((resolve) => {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;

        // 视觉隐藏但保留在 DOM 中，防止页面抖动
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        textArea.style.opacity = '0';
        textArea.style.zIndex = '-1';

        document.body.appendChild(textArea);

        // 兼容性选中处理
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, 999999);

        let success = false;
        try {
            success = document.execCommand('copy', false, null);
        } catch (err) {
            console.error('execCommand 复制失败', err);
        }

        document.body.removeChild(textArea);

        if (success) {
            resolve(true);
        } else {
            // 终极降级：弹窗提示手动复制
            window.prompt('您的浏览器不支持自动复制，请按 Ctrl+C / Cmd+C 复制以下内容：', textToCopy);
            resolve(false);
        }
    });
}

// 绑定所有带 .copy-btn 类的按钮
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;

    const textToCopy = btn.getAttribute('data-copy-text');
    if (!textToCopy) return;

    const originalText = btn.textContent;
    
    // 执行复制
    const success = await copyToClipboard(textToCopy);

    // 视觉反馈
    if (success) {
        btn.textContent = '已复制';
        btn.style.opacity = '0.7';
        btn.disabled = true;
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.opacity = '';
            btn.disabled = false;
        }, 2000);
    }
});