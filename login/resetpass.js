import { supabase } from './supabaseClient.js';

const form = document.getElementById('resetForm');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const resetBtn = document.getElementById('resetBtn');
const alertMessage = document.getElementById('alertMessage');
const strengthContainer = document.getElementById('passwordStrength');
const strengthBar = document.getElementById('strengthBar');
const strengthText = document.getElementById('strengthText');

const reqLength = document.getElementById('req-length');
const reqUpper  = document.getElementById('req-upper');
const reqLower  = document.getElementById('req-lower');
const reqNumber = document.getElementById('req-number');
const reqSpecial = document.getElementById('req-special');

const toggleButtons = document.querySelectorAll('.toggle-password');
    
    toggleButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const input = document.getElementById(targetId);

            if (!input) return;

            const willShow = input.type === 'password';
            input.type = willShow ? 'text' : 'password';
            this.setAttribute('aria-label', willShow ? 'Hide password' : 'Show password');
            this.setAttribute('aria-pressed', willShow ? 'true' : 'false');
            this.classList.toggle('active', willShow);
        });
    });

    function checkPasswordStrength(password) {
        if (!password) return { strength: 'none', score: 0 };

        const hasLength  = password.length >= 8;
        const hasUpper   = /[A-Z]/.test(password);
        const hasLower   = /[a-z]/.test(password);
        const hasNumber  = /[0-9]/.test(password);
        const hasSpecial = /[@$!%*?&]/.test(password);

        const score = [hasLength, hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

        let strength = 'weak';
        if (score >= 4) strength = 'medium';
        if (score === 5) strength = 'strong';

        return { strength, score };
    }

    function updateRequirements(password) {
        const hasLength  = password.length >= 8;
        const hasUpper   = /[A-Z]/.test(password);
        const hasLower   = /[a-z]/.test(password);
        const hasNumber  = /[0-9]/.test(password);
        const hasSpecial = /[@$!%*?&]/.test(password);

        updateRequirement(reqLength, hasLength);
        updateRequirement(reqUpper, hasUpper);
        updateRequirement(reqLower, hasLower);
        updateRequirement(reqNumber, hasNumber);
        updateRequirement(reqSpecial, hasSpecial);

        return hasLength && hasUpper && hasLower && hasNumber && hasSpecial;
    }

    function updateRequirement(element, isMet) {
        if (isMet) {
            element.classList.add('met');
        } else {
            element.classList.remove('met');
        }
    }

    newPasswordInput.addEventListener('input', function() {
        const password = this.value;
        
        if (password.length > 0) {
            strengthContainer.style.display = 'flex';
            
            const { strength } = checkPasswordStrength(password);
            strengthBar.className = 'strength-bar-fill ' + strength;
            strengthText.className = 'strength-text ' + strength;
            
            if (strength === 'weak') {
                strengthText.textContent = 'Weak password';
            } else if (strength === 'medium') {
                strengthText.textContent = 'Medium password';
            } else if (strength === 'strong') {
                strengthText.textContent = 'Strong password';
            }
            
            updateRequirements(password);
        } else {
            strengthContainer.style.display = 'none';
            updateRequirement(reqLength, false);
            updateRequirement(reqUpper, false);
            updateRequirement(reqLower, false);
            updateRequirement(reqNumber, false);
            updateRequirement(reqSpecial, false);
        }

        if (alertMessage.style.display !== 'none') {
            hideAlert();
        }
        newPasswordInput.classList.remove('error');
        confirmPasswordInput.classList.remove('error');
    });

    confirmPasswordInput.addEventListener('input', function() {
        if (alertMessage.style.display !== 'none') {
            hideAlert();
        }
        confirmPasswordInput.classList.remove('error');
    });

    function showAlert(message, type) {
        alertMessage.textContent = message;
        alertMessage.className = 'alert-message ' + type;
        alertMessage.style.display = 'flex';
    }

    function hideAlert() {
        alertMessage.style.display = 'none';
    }

    function validateForm() {
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!newPassword || !confirmPassword) {
            showAlert('Please fill in all fields.', 'error');
            if (!newPassword) newPasswordInput.classList.add('error');
            if (!confirmPassword) confirmPasswordInput.classList.add('error');
            return false;
        }

        const meetsRequirements = updateRequirements(newPassword);
        if (!meetsRequirements) {
            showAlert('Password must be at least 8 characters and include uppercase, lowercase, numbers, and special characters (@$!%*?&).', 'error');
            newPasswordInput.classList.add('error');
            return false;
        }

        if (newPassword !== confirmPassword) {
            showAlert('Passwords do not match. Please try again.', 'error');
            confirmPasswordInput.classList.add('error');
            return false;
        }

        const { strength } = checkPasswordStrength(newPassword);
        if (strength === 'weak') {
            showAlert('Password is too weak. Please include upper, lower, number, and a special (@$!%*?&).', 'error');
            newPasswordInput.classList.add('error');
            return false;
        }

        return true;
    }

    // --- Supabase password recovery session handling ---

    let recoverySessionReady = false;

    function parseRecoveryParams() {
        const hash = window.location.hash || '';
        const search = window.location.search || '';

        const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
        const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

        const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');

        return { accessToken, refreshToken };
    }

    async function initRecoverySession() {
        const { accessToken, refreshToken } = parseRecoveryParams();

        if (!accessToken) {
            // If there is no access token in the URL, this link is likely invalid/expired.
            showAlert('This password reset link is invalid or has expired. Please request a new one.', 'error');
            Array.from(form.elements).forEach(el => { el.disabled = true; });
            return;
        }

        try {
            const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });

            if (error) {
                console.error('Error setting Supabase recovery session:', error);
                showAlert('Unable to validate reset link. Please request a new one.', 'error');
                Array.from(form.elements).forEach(el => { el.disabled = true; });
                return;
            }

            recoverySessionReady = true;
        } catch (err) {
            console.error('Unexpected error while initializing recovery session:', err);
            showAlert('Unable to validate reset link. Please request a new one.', 'error');
            Array.from(form.elements).forEach(el => { el.disabled = true; });
        }
    }

    initRecoverySession();

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        if (!recoverySessionReady) {
            showAlert('This password reset link is invalid or has expired. Please request a new one.', 'error');
            return;
        }

        resetBtn.disabled = true;
        const originalText = resetBtn.textContent;
        resetBtn.textContent = 'Resetting password...';

        try {
            const newPassword = newPasswordInput.value;

            const { error } = await supabase.auth.updateUser({ password: newPassword });

            if (error) {
                console.error('Supabase updateUser error:', error);
                showAlert('Unable to reset password. The reset link may have expired. Please request a new one.', 'error');
                return;
            }

            showAlert('Password reset successfully! Redirecting to login...', 'success');

            setTimeout(() => {
                window.location.href = 'Log-in.html';
            }, 2000);

        } catch (error) {
            console.error('Unexpected error during password reset:', error);
            showAlert(error.message || 'An error occurred. Please try again.', 'error');
        } finally {
            resetBtn.disabled = false;
            resetBtn.textContent = originalText;
        }
    });
