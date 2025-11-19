
(function() {
    const roleSelect = document.getElementById('role');

    function updateRoleFields() {
        const role = roleSelect ? roleSelect.value : '';
        const commuterFields = document.getElementById('commuterFields');
        const driverFields = document.getElementById('driverFields');
        const identityDocument = document.getElementById('identityDocument');
        const plateNumber = document.getElementById('plateNumber');

        if (commuterFields) commuterFields.style.display = 'none';
        if (driverFields) driverFields.style.display = 'none';

        if (identityDocument) identityDocument.removeAttribute('required');
        if (plateNumber) plateNumber.removeAttribute('required');

        if (role === 'commuter') {
            if (commuterFields) commuterFields.style.display = 'block';
            if (identityDocument) identityDocument.setAttribute('required', 'required');
        } else if (role === 'driver') {
            if (driverFields) driverFields.style.display = 'block';
            if (plateNumber) plateNumber.setAttribute('required', 'required');
        }
    }

    if (roleSelect) {
        roleSelect.addEventListener('change', updateRoleFields);
        document.addEventListener('DOMContentLoaded', updateRoleFields);
        updateRoleFields();
    }
})();
