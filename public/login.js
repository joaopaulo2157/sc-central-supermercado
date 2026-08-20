(() => {
  const form = document.querySelector('#loginForm');
  const errorBox = document.querySelector('#loginError');
  const submit = document.querySelector('#loginSubmit');
  const password = document.querySelector('#password');

  document.querySelector('#togglePassword')?.addEventListener('click', () => {
    password.type = password.type === 'password' ? 'text' : 'password';
  });

  fetch('/api/auth/me', { cache:'no-store' }).then(r => {
    if (r.ok) location.href = 'admin.html';
  }).catch(() => {});

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    errorBox.hidden = true;
    submit.disabled = true;
    const old = submit.innerHTML;
    submit.innerHTML = '<span>Autenticando...</span><b>•••</b>';
    try {
      const response = await fetch('/api/auth/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          username:document.querySelector('#username').value.trim(),
          password:password.value
        })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Falha no login.');
      location.href = 'admin.html';
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      submit.disabled = false;
      submit.innerHTML = old;
    }
  });
})();
