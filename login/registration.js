
import { supabase, signUp, uploadDocument } from './supabaseClient.js';

// DOM refs
const form = document.getElementById('registrationForm');
const roleSelect = document.getElementById('role');
const commuterFields = document.getElementById('commuterFields');
const driverFields = document.getElementById('driverFields');
const identityDocumentInput = document.getElementById('identityDocument');
const plateNumberInput = document.getElementById('plateNumber');
const licenseNumberInput = document.getElementById('licenseNumber');
const commuterIdUpload = document.getElementById('commuterIdUpload');
const driverLicenseUpload = document.getElementById('driverLicenseUpload');

function updateRoleFields() {
    const role = roleSelect.value;
    commuterFields.style.display = 'none';
    driverFields.style.display = 'none';
    identityDocumentInput.removeAttribute('required');
    plateNumberInput.removeAttribute('required');
    licenseNumberInput.removeAttribute('required');

    if (role === 'commuter') {
        commuterFields.style.display = 'block';
        identityDocumentInput.setAttribute('required', 'required');
    } else if (role === 'driver') {
        driverFields.style.display = 'block';
        plateNumberInput.setAttribute('required', 'required');
        licenseNumberInput.setAttribute('required', 'required');
    }
}

roleSelect.addEventListener('change', updateRoleFields);
document.addEventListener('DOMContentLoaded', updateRoleFields);

function validateFile(file) {
    if (!file) return null; // no file -> no error
    const maxBytes = 5 * 1024 * 1024; // 5MB
    const allowed = ['image/png','image/jpeg','image/jpg','application/pdf'];
    if (!allowed.includes(file.type)) return 'Unsupported file type: ' + file.type;
    if (file.size > maxBytes) return 'File too large (>5MB): ' + file.name;
    return null;
}

function showMessage(msg, isError = false) {
    // Simple fallback: alert. Could be replaced with inline UI feedback.
    alert(msg);
    if (isError) console.error(msg); else console.log(msg);
}

async function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(form);
    const username = formData.get('username').trim();
    const email = formData.get('email').trim();
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    const role = formData.get('role');
    const identityDocumentRaw = formData.get('identityDocument');
    const plateNumberRaw = formData.get('plateNumber');
    const licenseNumberRaw = formData.get('licenseNumber');
    const identityDocument = identityDocumentRaw ? identityDocumentRaw.trim() : '';
    const plateNumber = plateNumberRaw ? plateNumberRaw.trim().toUpperCase() : '';
    const licenseNumber = licenseNumberRaw ? licenseNumberRaw.trim().toUpperCase() : '';

    if (!role) return showMessage('Please select a role.', true);
    if (password !== confirmPassword) return showMessage('Passwords do not match.', true);

    // Additional custom validations
    if (role === 'commuter' && !identityDocument) return showMessage('Identity document number required.', true);
    if (role === 'driver' && (!plateNumber || !licenseNumber)) return showMessage('Plate and license numbers required.', true);

    // Validate files
    const commuterFile = commuterIdUpload.files[0] || null;
    const driverFile = driverLicenseUpload.files[0] || null;
    const fileErrors = [];
    if (role === 'commuter') {
        const err = validateFile(commuterFile);
        if (err) fileErrors.push('Commuter ID: ' + err);
    }
    if (role === 'driver') {
        const err = validateFile(driverFile);
        if (err) fileErrors.push("Driver's License: " + err);
    }
    if (fileErrors.length) return showMessage('File validation errors:\n' + fileErrors.join('\n'), true);

    showMessage('Creating account...');

    // Sign up
    const { data: signUpData, error: signUpError } = await signUp(email, password);
    if (signUpError) return showMessage('Sign-up failed: ' + signUpError.message, true);

    // Retrieve user id (might need session if email confirmation required)
    let userId = signUpData && signUpData.user ? signUpData.user.id : null;
    if (!userId) {
        const { data: sessionData } = await supabase.auth.getSession();
        userId = (sessionData && sessionData.session && sessionData.session.user) ? sessionData.session.user.id : null;
    }
    if (!userId) {
        return showMessage('Account created, please verify your email to complete registration.', false);
    }

    // Insert profile
    const { error: profileError } = await supabase.from('profiles').insert({
        id: userId,
        email,
        username,
        role
    });
    if (profileError) {
        if (profileError.message.includes('duplicate')) {
            return showMessage('Username already taken. Please choose another.', true);
        }
        return showMessage('Profile insert failed: ' + profileError.message, true);
    }

    // Role-specific inserts
    if (role === 'commuter') {
        const { error: commuterErr } = await supabase.from('commuters').insert({
            user_id: userId,
            identity_document: identityDocument
        });
        if (commuterErr) return showMessage('Commuter data failed: ' + commuterErr.message, true);
    } else if (role === 'driver') {
        const { error: driverErr } = await supabase.from('drivers').insert({
            user_id: userId,
            plate_number: plateNumber,
            license_number: licenseNumber
        });
        if (driverErr) return showMessage('Driver data failed: ' + driverErr.message, true);
    }

    // File uploads & documents metadata
    const warnings = [];
    // Ensure fresh session token (some browsers delay persistence right after signUp)
    const { data: freshSessionData, error: freshSessionError } = await supabase.auth.getSession();
    if (freshSessionError) {
        warnings.push('Could not refresh session before uploads: ' + freshSessionError.message);
    }
    const activeUserId = (freshSessionData && freshSessionData.session && freshSessionData.session.user) ? freshSessionData.session.user.id : userId;
    if (!activeUserId) {
        warnings.push('No active session user; skipping document uploads.');
    } else {
        console.log('Uploading documents for userId:', activeUserId);
    }
    if (role === 'commuter' && commuterFile && activeUserId) {
        // Debug pre-insert to isolate RLS
        const debugRow = {
            user_id: activeUserId,
            storage_path: 'debug/pre_insert.txt',
            file_type: 'text/plain',
            size: 0,
            document_type: 'debug_pre'
        };
        const { error: preErr } = await supabase.from('documents').insert(debugRow);
        if (preErr) {
            console.error('[registration] Pre-insert debug failed:', preErr.message);
            warnings.push('Pre-insert debug (documents) failed: ' + preErr.message);
        } else {
            console.log('[registration] Pre-insert debug succeeded');
        }
        const { path, uploadError, metaError } = await uploadDocument(activeUserId, commuterFile, 'commuter_id');
        if (uploadError) warnings.push('Storage upload commuter ID failed: ' + uploadError.message);
        if (metaError) warnings.push('Metadata insert commuter ID failed: ' + metaError.message);
        if (!uploadError && !metaError) console.log('Commuter ID uploaded to:', path);
    }
    if (role === 'driver' && driverFile && activeUserId) {
        const debugRow2 = {
            user_id: activeUserId,
            storage_path: 'debug/pre_insert2.txt',
            file_type: 'text/plain',
            size: 0,
            document_type: 'debug_pre'
        };
        const { error: preErr2 } = await supabase.from('documents').insert(debugRow2);
        if (preErr2) {
            console.error('[registration] Pre-insert debug driver failed:', preErr2.message);
            warnings.push('Pre-insert debug (documents) failed driver: ' + preErr2.message);
        } else {
            console.log('[registration] Pre-insert debug driver succeeded');
        }
        const { path, uploadError, metaError } = await uploadDocument(activeUserId, driverFile, 'driver_license');
        if (uploadError) warnings.push("Storage upload driver's license failed: " + uploadError.message);
        if (metaError) warnings.push("Metadata insert driver's license failed: " + metaError.message);
        if (!uploadError && !metaError) console.log("Driver's license uploaded to:", path);
    }

    let successMsg = 'Registration complete.';
    if (warnings.length) successMsg += '\nWarnings:\n' + warnings.join('\n');
    showMessage(successMsg);
    form.reset();
    updateRoleFields();
}

form.addEventListener('submit', handleSubmit);
