import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Verify the requester is an authenticated admin
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ message: 'Unauthorized' });

  const requesterRole = user.app_metadata?.role;
  if (requesterRole !== 'admin' && requesterRole !== 'hr_manager') {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }

  const { employee_data, password } = req.body;
  if (!employee_data?.user_id || !password) {
    return res.status(400).json({ message: 'user_id and password are required' });
  }

  try {
    // Create Supabase Auth user
    const email = `${employee_data.user_id}@afaqhr.internal`;
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) throw authError;

    // Generate employee ID
    const { data: existing } = await supabaseAdmin
      .from('employees')
      .select('name')
      .order('name', { ascending: false })
      .limit(1);
    const lastNum = existing?.[0]?.name
      ? parseInt(existing[0].name.replace('HR-EMP-', '')) || 0
      : 0;
    const id = `HR-EMP-${String(lastNum + 1).padStart(4, '0')}`;

    // Create employee record (no password stored)
    const record = {
      name: id,
      auth_id: authData.user.id,
      employee_name:   employee_data.employee_name || '',
      department:      employee_data.department || '',
      designation:     employee_data.designation || '',
      cell_number:     employee_data.cell_number || '',
      image:           '',
      user_id:         employee_data.user_id || '',
      password:        '', // not stored anymore
      company:         employee_data.company || process.env.DEFAULT_COMPANY || 'Afaq Al-Fiker',
      date_of_joining: employee_data.date_of_joining || null,
      gender:          employee_data.gender || '',
      date_of_birth:   employee_data.date_of_birth || null,
      employment_type: employee_data.employment_type || 'Full-time',
      branch:          employee_data.branch || '',
      personal_email:  employee_data.personal_email || '',
      company_email:   employee_data.company_email || '',
      reports_to:      employee_data.reports_to || null,
      role:            employee_data.role || 'employee',
    };

    const { data: emp, error: empError } = await supabaseAdmin
      .from('employees').insert(record).select().single();
    if (empError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw empError;
    }

    // Store role + employee_id in auth metadata
    await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
      app_metadata: { role: emp.role || 'employee', employee_id: emp.name },
    });

    return res.status(200).json(emp);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
}
