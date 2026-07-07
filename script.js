const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');
const revealItems = document.querySelectorAll('.reveal');
const counters = document.querySelectorAll('[data-count]');

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    siteNav.classList.toggle('open');
  });

  siteNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      siteNav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('visible'));
}

const animateCounter = (el) => {
  const target = Number(el.dataset.count || 0);
  const suffix = el.dataset.suffix || '';
  const duration = 1300;
  const start = performance.now();

  const tick = (time) => {
    const progress = Math.min((time - start) / duration, 1);
    const value = Math.floor(target * progress);
    el.textContent = `${value}${suffix}`;

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = `${target}${suffix}`;
    }
  };

  requestAnimationFrame(tick);
};

if ('IntersectionObserver' in window) {
  const counterObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach((counter) => counterObserver.observe(counter));
}

document.querySelectorAll('.current-year').forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

const createAiChatPopup = () => {
  if (document.querySelector('.ai-chat-popup')) {
    return;
  }

  const popup = document.createElement('aside');
  popup.className = 'ai-chat-popup';
  popup.setAttribute('aria-label', 'AI chat contact panel');

  popup.innerHTML = `
    <div class="ai-chat-popup__top">
      <p class="ai-chat-popup__tag">AI Chat</p>
      <button type="button" class="ai-chat-popup__toggle" aria-expanded="true" aria-label="Minimize chat">Minimize</button>
    </div>
    <h2>Need help? Contact us now.</h2>
    <div class="ai-chat-popup__content">
      <div class="ai-chat-popup__messages" aria-live="polite">
        <p class="ai-chat-msg ai-chat-msg--bot">Hi, I can help with services, pricing, and bookings.</p>
      </div>
      <div class="ai-chat-popup__quick" aria-label="Quick chat prompts">
        <button type="button" data-prompt="I want a quote">Get a quote</button>
        <button type="button" data-prompt="Which services do you offer?">Services</button>
        <button type="button" data-prompt="I want to book a call">Book call</button>
      </div>
      <form class="ai-chat-popup__composer" aria-label="AI chat message form">
        <input type="text" name="message" placeholder="Ask us anything..." aria-label="Type your message" maxlength="180" />
        <button type="submit">Send</button>
      </form>
      <div class="ai-chat-popup__actions">
        <a href="contact.html?v=20260707">Contact Us</a>
        <a href="tel:07843969254">Call 07843969254</a>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  const toggleButton = popup.querySelector('.ai-chat-popup__toggle');
  const chatContent = popup.querySelector('.ai-chat-popup__content');
  const messages = popup.querySelector('.ai-chat-popup__messages');
  const composer = popup.querySelector('.ai-chat-popup__composer');
  const input = popup.querySelector('input[name="message"]');
  const quickButtons = popup.querySelectorAll('.ai-chat-popup__quick button');

  const getReply = (text) => {
    const message = text.toLowerCase();

    if (message.includes('quote') || message.includes('price') || message.includes('cost')) {
      return 'Great, we can prepare a quote quickly. Tap Contact Us and share your project details.';
    }

    if (message.includes('service') || message.includes('offer') || message.includes('help')) {
      return 'We support construction, cleaning, teeth whitening, and digital growth services.';
    }

    if (message.includes('book') || message.includes('call') || message.includes('meeting')) {
      return 'You can call now on 07843969254 or send your preferred time via the Contact Us form.';
    }

    return 'Thanks for your message. Use Contact Us for full details and our team will reply within 1 business day.';
  };

  const appendMessage = (text, role) => {
    const item = document.createElement('p');
    item.className = `ai-chat-msg ai-chat-msg--${role}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  };

  const handleMessage = (text) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    appendMessage(trimmed, 'user');
    const reply = getReply(trimmed);
    window.setTimeout(() => {
      appendMessage(reply, 'bot');
    }, 220);
  };

  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    handleMessage(input.value);
    input.value = '';
  });

  quickButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const promptText = button.dataset.prompt || '';
      handleMessage(promptText);
    });
  });

  toggleButton.addEventListener('click', () => {
    const isMinimized = popup.classList.toggle('ai-chat-popup--minimized');
    toggleButton.setAttribute('aria-expanded', String(!isMinimized));
    toggleButton.setAttribute('aria-label', isMinimized ? 'Expand chat' : 'Minimize chat');
    toggleButton.textContent = isMinimized ? '💬' : 'Minimize';
    chatContent.hidden = isMinimized;
  });
};

createAiChatPopup();

const initGallerySlideshows = () => {
  const slideshows = document.querySelectorAll('.gallery-slideshow');

  slideshows.forEach((slideshow) => {
    const slides = Array.from(slideshow.querySelectorAll('.gallery-slide'));
    const prevButton = slideshow.querySelector('.gallery-nav--prev');
    const nextButton = slideshow.querySelector('.gallery-nav--next');
    const intervalMs = Number(slideshow.dataset.interval || 3500);

    if (slides.length <= 1) {
      return;
    }

    const controls = document.createElement('div');
    controls.className = 'gallery-controls';

    const counter = document.createElement('p');
    counter.className = 'gallery-counter';

    const dots = document.createElement('div');
    dots.className = 'gallery-dots';

    slides.forEach((slide, slideIndex) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gallery-dot';
      dot.setAttribute('aria-label', `Go to slide ${slideIndex + 1}`);
      dot.addEventListener('click', () => {
        showSlide(slideIndex);
        restartAuto();
      });
      dots.appendChild(dot);
      slide.dataset.index = String(slideIndex + 1);
    });

    controls.append(counter, dots);
    slideshow.appendChild(controls);

    let index = 0;
    let timer = null;

    const showSlide = (targetIndex) => {
      slides[index].classList.remove('active');
      index = (targetIndex + slides.length) % slides.length;
      slides[index].classList.add('active');

      counter.textContent = `${index + 1} / ${slides.length}`;
      dots.querySelectorAll('.gallery-dot').forEach((dot, dotIndex) => {
        dot.classList.toggle('active', dotIndex === index);
      });
    };

    const startAuto = () => {
      timer = window.setInterval(() => {
        showSlide(index + 1);
      }, intervalMs);
    };

    const restartAuto = () => {
      if (timer) {
        window.clearInterval(timer);
      }
      startAuto();
    };

    prevButton?.addEventListener('click', () => {
      showSlide(index - 1);
      restartAuto();
    });

    nextButton?.addEventListener('click', () => {
      showSlide(index + 1);
      restartAuto();
    });

    showSlide(0);
    startAuto();
  });
};

initGallerySlideshows();
