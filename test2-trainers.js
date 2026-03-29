const mongoose = require('mongoose');

async function test() {
    await mongoose.connect('mongodb://localhost:27017/sop-pharma');
    
    // Check departments in soplibraries
    const sops = await mongoose.connection.collection('soplibraries').find({}).limit(10).toArray();
    console.log('SOP Departments:', sops.map(s => s.department));

    const User = mongoose.connection.collection('users');
    const trainers = await User.find({
        $or: [
          { role: 'trainer' },
          { isTrainerEligible: true }
        ]
    }).toArray();

    // The user's image shows the following strict mappings:
    // QA -> Abhishek Dave, QC -> Jayesh Aal, Micro -> Ulhas Mahajan, store -> Sanjay Chauhan
    // Production -> Darshan Parmar, Nirav Morasiya, Personnel -> Jignesh Trivedi, Engineering -> Devang Rathod
    // We try mapping them dynamically from the User model by checking the department field.
    const departmentToTrainersMap = new Map();

    const normalizeDept = (d) => {
      if (!d) return '';
      const lower = d.toLowerCase();
      if (lower.includes('micro')) return 'Microbiology';
      if (lower.includes('engineer')) return 'Engineering and Maintenance';
      if (lower.includes('person')) return 'Personnel';
      if (lower.includes('hr')) return 'Personnel';
      if (lower.includes('qa') || lower.includes('quality assurance')) return 'QA';
      if (lower.includes('qc') || lower.includes('quality control')) return 'QC';
      if (lower.includes('store')) return 'Store';
      if (lower.includes('prod')) return 'Production';
      return d;
    };

    trainers.forEach((user) => {
      const deptList = user.allowedDepartments?.length > 0 ? user.allowedDepartments : (user.department ? [user.department] : []);
      
      deptList.forEach((rawDept) => {
        const dept = normalizeDept(rawDept);
        if (!departmentToTrainersMap.has(dept)) {
          departmentToTrainersMap.set(dept, new Set());
        }
        departmentToTrainersMap.get(dept).add(user.name);
      });
    });

    console.log('\nDynamic map:', Array.from(departmentToTrainersMap.entries()).map(([k, v]) => [k, Array.from(v)]));

    process.exit(0);
}

test().catch(console.error);
