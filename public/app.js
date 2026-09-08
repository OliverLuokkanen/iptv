(function bootstrap() {
  const storageKey = 'iptv-auth';
  const state = {
    token: null,
    user: null,
    channels: [],
    editingChannelId: null,
    hls: null,
  };

  const elements = {
    authStatus: document.querySelector('#auth-status'),
    logoutButton: document.querySelector('#logout-button'),
    registerForm: document.querySelector('#register-form'),
    loginForm: document.querySelector('#login-form'),
    authMessage: document.querySelector('#auth-message'),
    channelsMessage: document.querySelector('#channels-message'),
    channelList: document.querySelector('#channel-list'),
    reloadButton: document.querySelector('#reload-button'),
    channelFormPanel: document.querySelector('#channel-form-panel'),
    channelForm: document.querySelector('#channel-form'),
    channelFormTitle: document.querySelector('#channel-form-title'),
    channelFormMessage: document.querySelector('#channel-form-message'),
    cancelEditButton: document.querySelector('#cancel-edit-button'),
    videoPlayer: document.querySelector('#video-player'),
    playerMessage: document.querySelector('#player-message'),
    epgFilter: document.querySelector('#epg-filter'),
    epgList: document.querySelector('#epg-list'),
    epgMessage: document.querySelector('#epg-message'),
    refreshEpgButton: document.querySelector('#refresh-epg-button'),
  };

  function setMessage(element, message) {
    element.hidden = !message;
    element.textContent = message || '';
  }

  function getField(form, name) {
    return form.elements.namedItem(name);
  }

  function persistAuth() {
    if (!state.token || !state.user) {
      localStorage.removeItem(storageKey);
      return;
    }

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        token: state.token,
        user: state.user,
      }),
    );
  }

  function loadStoredAuth() {
    const raw = localStorage.getItem(storageKey);

    if (!raw) {
      return;
    }

    try {
      const data = JSON.parse(raw);
      state.token = typeof data.token === 'string' ? data.token : null;
      state.user = data.user && typeof data.user.username === 'string' ? data.user : null;
    } catch (_error) {
      localStorage.removeItem(storageKey);
    }
  }

  function setAuthenticatedUser(payload) {
    state.token = payload.token;
    state.user = payload.user;
    persistAuth();
    renderAuthState();
  }

  function clearAuth(message) {
    state.token = null;
    state.user = null;
    state.channels = [];
    state.editingChannelId = null;
    persistAuth();
    renderAuthState();
    renderChannels();
    renderChannelForm();
    renderEpgFilter();
    renderPlayer(null);
    renderEpg([]);
    if (message) {
      setMessage(elements.authMessage, message);
    }
  }

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});

    if (options.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (state.token) {
      headers.set('Authorization', ['Bearer', state.token].join(' '));
    }

    const response = await fetch(path, {
      ...options,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = payload && typeof payload === 'object' ? payload.error : 'Request failed';
      const error = new Error(message || 'Request failed');
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function renderAuthState() {
    const isLoggedIn = Boolean(state.token && state.user);

    elements.authStatus.textContent = isLoggedIn
      ? `Signed in as ${state.user.username}`
      : 'Not signed in';
    elements.logoutButton.hidden = !isLoggedIn;
    elements.channelFormPanel.hidden = !isLoggedIn;
  }

  function renderChannels() {
    elements.channelList.innerHTML = '';

    if (!state.token) {
      setMessage(elements.channelsMessage, 'Log in or register to load channels.');
      return;
    }

    setMessage(elements.channelsMessage, state.channels.length ? '' : 'No channels available yet.');

    state.channels.forEach((channel) => {
      const card = document.createElement('article');
      card.className = 'channel-card';

      const selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.className = 'channel-select';
      const content = document.createElement('div');
      content.className = 'channel-card-content';

      let logo;

      if (channel.logo) {
        logo = document.createElement('img');
        logo.className = 'channel-logo';
        logo.src = channel.logo;
        logo.alt = `${channel.name} logo`;
      } else {
        logo = document.createElement('div');
        logo.className = 'channel-logo channel-logo-placeholder';
        logo.textContent = 'No logo';
      }

      const title = document.createElement('h3');
      title.textContent = channel.name;

      const tvgId = document.createElement('p');
      tvgId.className = 'muted';
      tvgId.textContent = channel.tvgId || 'No TVG ID';

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = channel.category || 'General';

      content.append(logo, title, tvgId, badge);
      selectButton.appendChild(content);
      selectButton.addEventListener('click', () => {
        renderPlayer(channel);
        elements.epgFilter.value = String(channel.id);
        loadEpg(channel.id);
      });

      card.appendChild(selectButton);

      if (state.token) {
        const actions = document.createElement('div');
        actions.className = 'channel-actions channel-card-content';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'secondary';
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', () => startEditing(channel));

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'danger';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => deleteChannel(channel));

        actions.append(editButton, deleteButton);
        card.appendChild(actions);
      }

      elements.channelList.appendChild(card);
    });
  }

  function renderChannelForm() {
    const form = elements.channelForm;
    const nameField = getField(form, 'name');
    const urlField = getField(form, 'url');
    const categoryField = getField(form, 'category');
    const logoField = getField(form, 'logo');
    const tvgIdField = getField(form, 'tvgId');
    const isEditing = state.editingChannelId !== null;
    const channel = state.channels.find((item) => item.id === state.editingChannelId);

    elements.channelFormTitle.textContent = isEditing ? 'Edit channel' : 'Add channel';
    elements.cancelEditButton.hidden = !isEditing;

    nameField.value = channel?.name || '';
    urlField.value = channel?.url || '';
    categoryField.value = channel?.category || 'General';
    logoField.value = channel?.logo || '';
    tvgIdField.value = channel?.tvgId || '';
  }

  function renderEpgFilter() {
    const selectedValue = elements.epgFilter.value;
    elements.epgFilter.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All channels';
    elements.epgFilter.appendChild(allOption);

    state.channels.forEach((channel) => {
      const option = document.createElement('option');
      option.value = String(channel.id);
      option.textContent = channel.name;
      elements.epgFilter.appendChild(option);
    });

    if ([...elements.epgFilter.options].some((option) => option.value === selectedValue)) {
      elements.epgFilter.value = selectedValue;
    }
  }

  function renderEpg(programs) {
    elements.epgList.innerHTML = '';

    if (!state.token) {
      setMessage(elements.epgMessage, 'Log in to load EPG data.');
      return;
    }

    setMessage(elements.epgMessage, programs.length ? '' : 'No program data available.');

    programs.forEach((program) => {
      const item = document.createElement('article');
      item.className = 'epg-item';

      const title = document.createElement('strong');
      title.textContent = program.title;

      const channelName = document.createElement('p');
      channelName.textContent = program.channelName || '';

      const time = document.createElement('p');
      time.className = 'muted';
      time.textContent = `${formatDate(program.startTime)} – ${formatDate(program.endTime)}`;

      const description = document.createElement('p');
      description.textContent = program.description || 'No description available.';

      item.append(title, channelName, time, description);
      elements.epgList.appendChild(item);
    });
  }

  function stopPlayer() {
    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }

    elements.videoPlayer.pause();
    elements.videoPlayer.removeAttribute('src');
    elements.videoPlayer.load();
  }

  function renderPlayer(channel) {
    stopPlayer();

    if (!channel || !state.token) {
      setMessage(elements.playerMessage, state.token ? 'Select a channel to start playback.' : 'Log in to start playback.');
      return;
    }

    const streamUrl = `/api/stream/${channel.id}?token=${encodeURIComponent(state.token)}`;
    setMessage(elements.playerMessage, `Loading ${channel.name}...`);

    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(elements.videoPlayer);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        setMessage(elements.playerMessage, '');
        elements.videoPlayer.play().catch(() => {});
      });
      hls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) {
          setMessage(
            elements.playerMessage,
            'The selected stream could not be played in this browser. Try another HLS source.',
          );
        }
      });
      state.hls = hls;
      return;
    }

    if (elements.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
      elements.videoPlayer.src = streamUrl;
      elements.videoPlayer.play().catch(() => {});
      setMessage(elements.playerMessage, '');
      return;
    }

    setMessage(elements.playerMessage, 'This browser does not support HLS playback.');
  }

  function startEditing(channel) {
    state.editingChannelId = channel.id;
    renderChannelForm();
    setMessage(elements.channelFormMessage, '');
    elements.channelForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadChannels() {
    if (!state.token) {
      renderChannels();
      return;
    }

    try {
      const payload = await apiFetch('/api/channels');
      state.channels = payload.channels || [];
      renderChannels();
      renderChannelForm();
      renderEpgFilter();
    } catch (error) {
      handleApiError(error, elements.channelsMessage);
    }
  }

  async function loadEpg(channelId = '') {
    if (!state.token) {
      renderEpg([]);
      return;
    }

    try {
      const query = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
      const payload = await apiFetch(`/api/epg${query}`);
      renderEpg(payload.programs || []);
    } catch (error) {
      handleApiError(error, elements.epgMessage);
    }
  }

  async function submitAuth(path, form, messageElement) {
    setMessage(messageElement, '');

    try {
      const payload = await apiFetch(path, {
        method: 'POST',
        body: {
          username: getField(form, 'username').value.trim(),
          password: getField(form, 'password').value,
        },
      });

      setAuthenticatedUser(payload);
      form.reset();
      await refreshData();
      setMessage(messageElement, path.includes('register') ? 'Registration succeeded.' : 'Login succeeded.');
    } catch (error) {
      handleApiError(error, messageElement);
    }
  }

  async function saveChannel(event) {
    event.preventDefault();

    if (!state.token) {
      setMessage(elements.channelFormMessage, 'Log in before managing channels.');
      return;
    }

    const body = {
      name: getField(elements.channelForm, 'name').value.trim(),
      url: getField(elements.channelForm, 'url').value.trim(),
      category: getField(elements.channelForm, 'category').value.trim(),
      logo: getField(elements.channelForm, 'logo').value.trim(),
      tvgId: getField(elements.channelForm, 'tvgId').value.trim(),
    };

    try {
      const path = state.editingChannelId
        ? `/api/channels/${state.editingChannelId}`
        : '/api/channels';
      const method = state.editingChannelId ? 'PUT' : 'POST';

      await apiFetch(path, { method, body });
      setMessage(
        elements.channelFormMessage,
        state.editingChannelId ? 'Channel updated.' : 'Channel created.',
      );
      state.editingChannelId = null;
      elements.channelForm.reset();
      getField(elements.channelForm, 'category').value = 'General';
      await refreshData();
    } catch (error) {
      handleApiError(error, elements.channelFormMessage);
    }
  }

  async function deleteChannel(channel) {
    if (!window.confirm(`Delete ${channel.name}?`)) {
      return;
    }

    try {
      await apiFetch(`/api/channels/${channel.id}`, { method: 'DELETE' });
      if (state.editingChannelId === channel.id) {
        state.editingChannelId = null;
      }
      await refreshData();
      setMessage(elements.channelsMessage, `${channel.name} deleted.`);
    } catch (error) {
      handleApiError(error, elements.channelsMessage);
    }
  }

  function handleApiError(error, messageElement) {
    if (error.status === 401) {
      clearAuth('Your session expired. Please log in again.');
      return;
    }

    setMessage(messageElement, error.message || 'Request failed.');
  }

  async function refreshData() {
    await Promise.all([loadChannels(), loadEpg(elements.epgFilter.value)]);
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  elements.registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth('/api/auth/register', elements.registerForm, elements.authMessage);
  });

  elements.loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth('/api/auth/login', elements.loginForm, elements.authMessage);
  });

  elements.logoutButton.addEventListener('click', () => {
    clearAuth('Logged out.');
  });

  elements.reloadButton.addEventListener('click', () => {
    refreshData().catch((error) => handleApiError(error, elements.channelsMessage));
  });

  elements.channelForm.addEventListener('submit', saveChannel);

  elements.cancelEditButton.addEventListener('click', () => {
    state.editingChannelId = null;
    renderChannelForm();
    setMessage(elements.channelFormMessage, '');
  });

  elements.epgFilter.addEventListener('change', () => {
    loadEpg(elements.epgFilter.value).catch((error) => handleApiError(error, elements.epgMessage));
  });

  elements.refreshEpgButton.addEventListener('click', () => {
    loadEpg(elements.epgFilter.value).catch((error) => handleApiError(error, elements.epgMessage));
  });

  elements.videoPlayer.addEventListener('error', () => {
    setMessage(
      elements.playerMessage,
      'The selected stream could not be played in this browser. Try another HLS source.',
    );
  });

  loadStoredAuth();
  renderAuthState();
  renderChannels();
  renderChannelForm();
  renderEpgFilter();
  renderPlayer(null);
  renderEpg([]);

  if (state.token) {
    refreshData().catch((error) => handleApiError(error, elements.authMessage));
  }
})();
