import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-supabase-role': 'service_role',
    },
  },
});

// Officer definitions
const officersToCreate = [
  {
    email: 'admin@streetvoice.pk',
    password: 'admin123456',
    role: 'admin' as const,
    fullName: 'System Admin',
    departmentName: null,
  },
  {
    email: 'water.officer@streetvoice.pk',
    password: 'officer123456',
    role: 'officer' as const,
    fullName: 'Water & Sanitation Officer',
    departmentName: 'Water & Sanitation',
  },
  {
    email: 'electricity.officer@streetvoice.pk',
    password: 'officer123456',
    role: 'officer' as const,
    fullName: 'Electricity Officer',
    departmentName: 'Electricity',
  },
  {
    email: 'roads.officer@streetvoice.pk',
    password: 'officer123456',
    role: 'officer' as const,
    fullName: 'Roads & Infrastructure Officer',
    departmentName: 'Roads & Infrastructure',
  },
  {
    email: 'waste.officer@streetvoice.pk',
    password: 'officer123456',
    role: 'officer' as const,
    fullName: 'Sanitation & Waste Officer',
    departmentName: 'Sanitation & Waste',
  },
  {
    email: 'general.officer@streetvoice.pk',
    password: 'officer123456',
    role: 'officer' as const,
    fullName: 'General Officer',
    departmentName: 'General/Unclassified',
  },
];

async function main() {
  console.log('🌱 StreetVoice Officer Seed Script\n');

  // Fetch departments
  console.log('Fetching departments...');
  const { data: departments, error: deptError } = await supabase
    .from('departments')
    .select('id, name');

  if (deptError) {
    console.error('Failed to fetch departments:', deptError);
    process.exit(1);
  }

  const deptMap = new Map<string, string>();
  for (const d of departments!) {
    deptMap.set(d.name, d.id);
  }
  console.log(`Found ${departments!.length} departments.\n`);

  // Create each officer
  const seededAccounts: {
    email: string;
    password: string;
    role: string;
    department: string;
  }[] = [];

  for (const officer of officersToCreate) {
    console.log(`Processing: ${officer.email} ...`);

    let userId: string | null = null;

    // Try creating the auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: officer.email,
      password: officer.password,
      email_confirm: true,
    });

    if (authError) {
      // Check if user already exists
      const isAlreadyRegistered =
        authError.message.includes('already registered') ||
        authError.message.includes('already been registered') ||
        authError.message.includes('User already');

      if (isAlreadyRegistered) {
        console.log(`  ⚠ User already exists, looking up by email...`);
        const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) {
          console.error(`  ✗ Failed to list users: ${listError.message}`);
          continue;
        }
        const existing = listData.users.find(
          (u) => u.email?.toLowerCase() === officer.email.toLowerCase(),
        );
        if (!existing) {
          console.error(`  ✗ User reported as existing but not found in list`);
          continue;
        }
        userId = existing.id;
        console.log(`  ✓ Found existing user: ${userId}`);
      } else {
        console.error(`  ✗ Failed to create auth user: ${authError.message}`);
        continue;
      }
    } else {
      userId = authUser.user!.id;
      console.log(`  ✓ Auth user created: ${userId}`);
    }

    if (!userId) {
      console.error(`  ✗ No user ID available, skipping officer row`);
      continue;
    }

    // Check if officer row already exists
    const { data: existingOfficer } = await supabase
      .from('officers')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    const departmentId = officer.departmentName ? deptMap.get(officer.departmentName) ?? null : null;

    if (existingOfficer) {
      console.log(`  ⚠ Officer row already exists, updating...`);
      const { error: updateError } = await supabase
        .from('officers')
        .update({
          department_id: departmentId,
          role: officer.role,
          full_name: officer.fullName,
        })
        .eq('id', userId);

      if (updateError) {
        console.error(`  ✗ Failed to update officer row: ${updateError.message}`);
      } else {
        console.log(`  ✓ Officer row updated (${officer.role}, dept=${officer.departmentName ?? '—'})`);
      }
    } else {
      const { error: insertError } = await supabase.from('officers').insert({
        id: userId,
        department_id: departmentId,
        role: officer.role,
        full_name: officer.fullName,
      });

      if (insertError) {
        console.error(`  ✗ Failed to insert officer row: ${insertError.message}`);
      } else {
        console.log(`  ✓ Officer row created (${officer.role}, dept=${officer.departmentName ?? '—'})`);
      }
    }

    seededAccounts.push({
      email: officer.email,
      password: officer.password,
      role: officer.role,
      department: officer.departmentName ?? '—',
    });
  }

  // Print credential summary
  console.log('\n✅ Seeded Officers:');
  console.log(
    '┌' + '─'.repeat(45) + '┬' + '─'.repeat(16) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(28) + '┐',
  );
  console.log(
    '│ ' +
      'Email'.padEnd(43) +
      '│ ' +
      'Password'.padEnd(14) +
      '│ ' +
      'Role'.padEnd(8) +
      '│ ' +
      'Department'.padEnd(26) +
      '│',
  );
  console.log(
    '├' + '─'.repeat(45) + '┼' + '─'.repeat(16) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(28) + '┤',
  );
  for (const acct of seededAccounts) {
    console.log(
      '│ ' +
        acct.email.padEnd(43) +
        '│ ' +
        acct.password.padEnd(14) +
        '│ ' +
        acct.role.padEnd(8) +
        '│ ' +
        acct.department.padEnd(26) +
        '│',
    );
  }
  console.log(
    '└' + '─'.repeat(45) + '┴' + '─'.repeat(16) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(28) + '┘',
  );
  console.log(`\n🎉 Seed complete. ${seededAccounts.length} account(s) processed.`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
