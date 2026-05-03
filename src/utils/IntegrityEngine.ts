export interface ProfileHealth {
    score: number; // 0-100
    missingFields: string[];
    isComplete: boolean;
    requirements: string[];
}

export const checkProfileIntegrity = (user: any, role: string): ProfileHealth => {
    let missingFields: string[] = [];
    let requirements: string[] = [];
    const normalizedRole = role?.toUpperCase();

    if (normalizedRole === 'OWNER') {
        requirements = ['Bank Name', 'IBAN', 'Account Holder Name', 'Swift Code', 'Contact Phone'];
        if (!user.bankDetails?.bankName) missingFields.push('Bank Name');
        if (!user.bankDetails?.iban) missingFields.push('IBAN');
        if (!user.bankDetails?.accountHolderName) missingFields.push('Account Holder Name');
        if (!user.bankDetails?.swiftCode) missingFields.push('Swift Code');
        if (!user.phone) missingFields.push('Contact Phone');
    } else if (normalizedRole === 'TECHNICIAN') {
        requirements = ['Service Zones', 'Emirate', 'Specialization', 'Contact Phone'];
        if (!user.assignedZones || user.assignedZones.length === 0) missingFields.push('Service Zones');
        if (!user.emirate) missingFields.push('Emirate');
        if (!user.specialization) missingFields.push('Specialization');
        if (!user.phone) missingFields.push('Contact Phone');
    } else if (normalizedRole === 'TENANT') {
        requirements = ['Phone Number', 'Property Link', 'Unit Assignment'];
        if (!user.phone) missingFields.push('Phone Number');
        // Unit discovery logic typically depends on Firestore mapping
    } else if (normalizedRole === 'BROKER') {
        requirements = ['License Number', 'Company Name', 'Contact Phone'];
        if (!user.licenseNumber) missingFields.push('License Number');
        if (!user.companyName) missingFields.push('Company Name');
        if (!user.phone) missingFields.push('Contact Phone');
    } else if (normalizedRole === 'ADMIN') {
        requirements = ['Staff ID', 'Position', 'Clearance Level'];
        if (!user.staffId) missingFields.push('Staff ID');
        if (!user.position) missingFields.push('Position');
        if (!user.clearance) missingFields.push('Clearance Level');
    }

    const total = requirements.length || 1;
    const score = Math.round(((total - missingFields.length) / total) * 100);

    return {
        score,
        missingFields,
        isComplete: missingFields.length === 0,
        requirements
    };
};
