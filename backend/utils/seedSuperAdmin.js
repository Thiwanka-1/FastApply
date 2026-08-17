//seedSuperAdmin.js
// Guarantees exactly one hidden super admin account exists, so a fresh
// deployment (empty database) is manageable out of the box. Credentials come
// from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD, with well-known defaults for
// first boot — change them immediately on a real deployment.
import User from '../models/User.js';
import Profile from '../models/Profile.js';

const seedSuperAdmin = async () => {
  try {
    const email = String(
      process.env.SUPER_ADMIN_EMAIL || 'superadmin@gmail.com'
    ).toLowerCase().trim();

    const password = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123';

    const existingSuperAdmin = await User.findOne({ role: 'superadmin' });
    if (existingSuperAdmin) return;

    // If the configured email already belongs to someone, promote it instead
    // of failing on the unique-email index.
    const existingByEmail = await User.findOne({ email });
    if (existingByEmail) {
      existingByEmail.role = 'superadmin';
      await existingByEmail.save();
      console.log(`Promoted ${email} to super admin.`);
      return;
    }

    const superAdmin = await User.create({
      name: 'System Administrator',
      email,
      password,
      role: 'superadmin'
    });

    try {
      await Profile.create({ user: superAdmin._id });
    } catch (_) {
      // The super admin does not need an autofill profile; ignore.
    }

    console.log(
      `Default super admin created (${email}). ` +
      'Change the password after the first login.'
    );
  } catch (error) {
    console.error('Super admin seeding failed:', error.message);
  }
};

export default seedSuperAdmin;
