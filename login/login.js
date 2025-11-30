// Login functionality using Supabase Auth
// This file assumes supabaseClient.js is loaded as a module in the page.

import { supabase, signIn } from './supabaseClient.js';

const loginBtn = document.getElementById('loginBtn');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');

async function doLogin() {
    const email = emailEl.value.trim();
    const password = passwordEl.value.trim();
    if (!email || !password) {
        alert('Please enter both email and password.');
        return;
    }
    // disable button while processing
    loginBtn.setAttribute('disabled', 'true');
    try {
        const { data, error } = await signIn(email, password);
        if (error) {
            const msg = (error.message || '').toLowerCase();
            if (msg.includes('email') && msg.includes('confirm')) {
                alert('Please verify your email first. Check your inbox for the confirmation link.');
            } else {
                alert('Invalid login credentials. Please check your email and password.');
            }
            return;
        }
        // Signed in: get role from profiles table using the auth user id
        const userId = data?.user?.id;
        let role = 'commuter';
        if (userId) {
            const { data: profile, error: roleErr } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();
            if (roleErr) {
                console.warn('Role lookup failed:', roleErr.message);
            } else if (profile && profile.role) {
                role = profile.role;
            }
        }
        // Redirect based on role
        if (role === 'driver') {
            window.location.href = '../mainpage/driver.html';
        } else {
            window.location.href = '../mainpage/commuter.html';
        }
    } finally {
        loginBtn.removeAttribute('disabled');
    }
}

loginBtn.addEventListener('click', function(e) {
    e.preventDefault();
    doLogin();
});