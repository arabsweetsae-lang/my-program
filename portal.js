(() => {
const bridge = window.portalBridge;
const loginScreen = document.getElementById('login-screen');
const applicationBar = document.getElementById('application-bar');
const loginError = document.getElementById('login-error');
const loginFeedback = document.getElementById('login-feedback');
const passwordDialog = document.getElementById('password-dialog');
const passwordMessage = document.getElementById('password-message');

function showMessage(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

if (!bridge || typeof bridge.authenticate !== 'function' ||
    typeof bridge.openApplication !== 'function' ||
    typeof bridge.onStateChange !== 'function') {
  showMessage(
    loginError,
    'هذه واجهة نسخة ويندوز ولا تعمل عند فتح الملف في المتصفح. شغّل مثبت بوابة الأنظمة، أو افتح رابط الويب المنشور من مجلد web بعد إعداد Supabase.'
  );
  document.querySelector('#login-form button[type="submit"]').disabled = true;
  document.getElementById('change-password-button').disabled = true;
  return;
}

function showLogin() {
  applicationBar.hidden = true;
  loginScreen.hidden = false;
  document.getElementById('password').value = '';
  showMessage(loginError, '');
  showMessage(loginFeedback, '');
  document.getElementById('password').focus();
}

function showApplication(label) {
  loginScreen.hidden = true;
  applicationBar.hidden = false;
  document.getElementById('active-app-label').textContent = label;
}

document.getElementById('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const username = document.getElementById('username').value.trim();
  const passwordField = document.getElementById('password');
  const selectedApplication = document.getElementById('application').value;
  const password = passwordField.value;
  button.disabled = true;
  showMessage(loginError, '');
  showMessage(loginFeedback, '');
  try {
    const authentication = await bridge.authenticate(username, password);
    if (!authentication.ok) {
      showMessage(loginError, authentication.message || 'اسم المستخدم أو كلمة المرور غير صحيحة.');
      passwordField.select();
      return;
    }

    passwordField.value = '';
    const result = await bridge.openApplication(selectedApplication);
    if (!result.ok) showMessage(loginError, result.message || 'تعذر فتح البرنامج المحدد.');
  } catch {
    showMessage(loginError, 'تعذر التحقق من بيانات الدخول أو فتح البرنامج. أعد المحاولة.');
  } finally {
    button.disabled = false;
  }
});

document.getElementById('return-button').addEventListener('click', () => bridge.returnToLogin());

document.getElementById('change-password-button').addEventListener('click', () => {
  showMessage(passwordMessage, '');
  document.getElementById('password-form').reset();
  passwordDialog.showModal();
  document.getElementById('current-password').focus();
});

document.getElementById('cancel-password-button').addEventListener('click', () => passwordDialog.close());

document.getElementById('password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  if (newPassword !== confirmPassword) {
    showMessage(passwordMessage, 'تأكيد كلمة المرور لا يطابق الكلمة الجديدة.');
    document.getElementById('confirm-password').focus();
    return;
  }

  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(passwordMessage, '');
  try {
    const authentication = await bridge.authenticate('admin', currentPassword);
    if (!authentication.ok) {
      showMessage(passwordMessage, authentication.message || 'كلمة المرور الحالية غير صحيحة.');
      document.getElementById('current-password').select();
      return;
    }

    const result = await bridge.changePassword(currentPassword, newPassword);
    if (!result.ok) {
      showMessage(passwordMessage, result.message || 'تعذر تغيير كلمة المرور.');
      return;
    }
    passwordDialog.close();
    event.currentTarget.reset();
    showMessage(loginFeedback, 'تم حفظ كلمة المرور الجديدة على هذا الجهاز.');
  } catch {
    showMessage(passwordMessage, 'تعذر حفظ كلمة المرور. أعد المحاولة.');
  } finally {
    button.disabled = false;
  }
});

bridge.onStateChange(state => {
  if (state.screen === 'login') showLogin();
  if (state.screen === 'app') showApplication(state.label);
});

showLogin();
})();
