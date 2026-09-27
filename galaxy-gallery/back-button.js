// back-button.js
export function createBackButton(container, { onClick }) {
    const btn = document.createElement('button');
    btn.className = 'galaxy-back-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', '返回选择星系');
  
    btn.innerHTML = `
      <span class="back-arrow">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.4"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </span>
      <span>返回选择星系</span>
    `;
  
    btn.addEventListener('click', onClick);
    container.appendChild(btn);
  
    return {
      show() { btn.classList.add('show'); },
      hide() { btn.classList.remove('show'); },
      destroy() {
        btn.removeEventListener('click', onClick);
        btn.remove();
      },
    };
  }