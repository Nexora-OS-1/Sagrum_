'use strict';

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (!element) return;
  element.textContent = typeof value === 'string' ? value : '';
};

function setSocialLink(id, url) {
  const link = document.getElementById(id);
  if (!link) return;
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.classList.remove('is-unconfigured');
    link.removeAttribute('aria-disabled');
  } else {
    link.href = '#';
    link.removeAttribute('target');
    link.classList.add('is-unconfigured');
    link.setAttribute('aria-disabled', 'true');
  }
}

function createClipCard(clip) {
  const article = document.createElement('article');
  article.className = 'clip-card reveal is-visible';

  const video = document.createElement('video');
  video.src = clip.src;
  video.controls = true;
  video.preload = 'metadata';
  video.playsInline = true;
  video.setAttribute('aria-label', clip.title || 'Video klip');

  const copy = document.createElement('div');
  copy.className = 'clip-card-copy';
  const title = document.createElement('h3');
  title.textContent = clip.title || 'Bez názvu';
  copy.append(title);
  if (clip.description) {
    const description = document.createElement('p');
    description.textContent = clip.description;
    copy.append(description);
  }
  article.append(video, copy);
  return article;
}

async function loadSiteContent() {
  try {
    const response = await fetch('/api/content', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Obsah sa nepodarilo načítať.');
    const content = await response.json();

    setText('#heroText', content.heroText);
    setText('#portfolioText', content.portfolioText);
    setText('#clipsText', content.clipsText);
    setText('#infoText', content.infoText);

    const infoTitle = document.querySelector('#infoTitle');
    if (infoTitle) {
      const heading = document.createTextNode(content.infoTitle || 'O mne');
      const dot = document.createElement('span');
      dot.className = 'accent-dot';
      dot.textContent = '.';
      infoTitle.replaceChildren(heading, dot);
    }

    setSocialLink('instagramLink', content.instagramUrl);
    setSocialLink('tiktokLink', content.tiktokUrl);
    setSocialLink('discordLink', content.discordUrl);
    setSocialLink('bookingLink', content.bookingUrl);

    const bookingLink = document.getElementById('bookingLink');
    if (bookingLink) {
      const badge = bookingLink.querySelector('.coming-soon');
      if (badge) badge.textContent = content.bookingUrl ? 'OTVORIŤ ↗' : 'ČOSKORO';
    }

    const grid = document.getElementById('clipsGrid');
    if (grid) {
      grid.replaceChildren();
      if (Array.isArray(content.clips) && content.clips.length) {
        content.clips.forEach((clip) => grid.append(createClipCard(clip)));
      } else {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        const icon = document.createElement('span');
        icon.className = 'empty-icon';
        icon.textContent = '▶';
        const text = document.createElement('p');
        text.textContent = 'Zatiaľ tu nie sú žiadne klipy.';
        empty.append(icon, text);
        grid.append(empty);
      }
    }
  } catch (error) {
    console.error('Nepodarilo sa načítať obsah webu:', error);
  }
}

function setupRevealAnimations() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        currentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  items.forEach((item) => observer.observe(item));
}

document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
  document.querySelectorAll('.is-unconfigured').forEach((link) => {
    link.addEventListener('click', (event) => event.preventDefault());
  });
  setupRevealAnimations();
  loadSiteContent();
});
