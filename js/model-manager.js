// /js/model-manager.js

/**
 * 初始化多个 model-viewer，每个模型独立控制动画
 * @param {Array} configs - 模型配置数组
 * @param {HTMLElement} container - 容器元素
 */
export function initModels(configs, container) {
    if (!container) throw new Error('容器不存在');

    configs.forEach((cfg, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.overflow = 'hidden';

        const viewer = document.createElement('model-viewer');
        viewer.id = cfg.id || `model-${index}`;
        viewer.src = cfg.src;
        viewer['environment-image'] = cfg.environment || 'neutral';
        viewer.exposure = cfg.exposure || 1.0;
        viewer['tone-mapping'] = 'aces';
        viewer['camera-orbit'] = cfg.orbit || '30deg 45deg 3m';
        viewer['camera-controls'] = true;
        viewer.alpha = true;
        viewer['shadow-intensity'] = 0.5;
        viewer['animation-loop'] = true;
        viewer.style.width = '100%';
        viewer.style.height = '300px';
        viewer.style.backgroundColor = 'transparent';
        viewer.style.display = 'block';
        card.appendChild(viewer);

        const body = document.createElement('div');
        body.className = 'card-body';

        if (cfg.title) {
            const title = document.createElement('h3');
            title.textContent = cfg.title;
            body.appendChild(title);
        }

        const controls = document.createElement('div');
        controls.className = 'controls';
        controls.style.display = 'flex';
        controls.style.flexWrap = 'wrap';
        controls.style.gap = '8px';
        controls.style.marginTop = '8px';
        body.appendChild(controls);
        card.appendChild(body);
        container.appendChild(card);

        // ----- 模型加载完成 -----
        viewer.addEventListener('load', function() {
            // 获取模型实际动画列表
            const actualAnims = this.availableAnimations || [];
            console.log(`📋 模型 ${cfg.id || index} 可用动画:`, actualAnims);

            // 确定要显示的动画名称列表（优先使用配置，否则用实际列表）
            let displayAnims = cfg.anims || actualAnims;
            // 如果配置的动画名称不在实际列表中，则自动修正
            if (cfg.anims) {
                displayAnims = cfg.anims.filter(name => 
                    actualAnims.some(actual => actual.toLowerCase() === name.toLowerCase())
                );
                if (displayAnims.length === 0) {
                    console.warn(`⚠️ 配置的动画名称与模型不符，使用实际列表`);
                    displayAnims = actualAnims;
                }
            }

            // 生成按钮
            controls.innerHTML = '';
            if (displayAnims.length > 0) {
                displayAnims.forEach(animName => {
                    const btn = document.createElement('button');
                    btn.textContent = `▶ ${animName}`;
                    btn.className = 'card-btn';
                    btn.dataset.anim = animName;
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        switchAnimation(viewer, animName);
                    });
                    controls.appendChild(btn);
                });
            } else {
                controls.innerHTML = '<span style="opacity:0.6; font-size:0.9rem;">无可用动画</span>';
            }

            // ----- 播放默认动画 -----
            let targetAnim = cfg.defaultAnim;
            if (targetAnim) {
                // 尝试匹配配置的默认动画
                const matched = actualAnims.find(
                    name => name.toLowerCase() === targetAnim.toLowerCase()
                );
                if (matched) {
                    viewer.animationName = matched;
                    viewer.play();
                    console.log(`✅ 播放默认动画: ${matched}`);
                } else {
                    // 如果默认动画不存在，播放第一个
                    if (actualAnims.length > 0) {
                        viewer.animationName = actualAnims[0];
                        viewer.play();
                        console.log(`✅ 默认动画 "${targetAnim}" 不存在，播放: ${actualAnims[0]}`);
                    }
                }
            } else if (actualAnims.length > 0) {
                // 没有指定默认动画，播放第一个
                viewer.animationName = actualAnims[0];
                viewer.play();
                console.log(`✅ 播放首个动画: ${actualAnims[0]}`);
            }
        });

        viewer.addEventListener('error', (e) => {
            console.error(`❌ 模型 ${cfg.id || index} 加载失败:`, e.detail);
            controls.innerHTML = `<span style="color:#e74c3c;">加载失败</span>`;
        });
    });
}

/**
 * 切换动画（忽略大小写）
 */
export function switchAnimation(viewer, animName) {
    if (!viewer || !viewer.availableAnimations) return;
    const matched = viewer.availableAnimations.find(
        name => name.toLowerCase() === animName.toLowerCase()
    );
    if (matched) {
        viewer.animationName = matched;
        viewer.play();
        console.log(`✅ 切换动画: ${matched}`);
    } else {
        console.warn(`⚠️ 动画 "${animName}" 不存在，可用:`, viewer.availableAnimations);
    }
}