const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/sop-pharma').then(async () => {
    const users = await mongoose.connection.collection('users').find({ role: 'trainer' }).toArray();
    console.log('Trainers:', users.map(u => ({ name: u.name, dept: u.department })));

    const usersEligible = await mongoose.connection.collection('users').find({ isTrainerEligible: true }).toArray();
    console.log('Eligible Trainers:', usersEligible.map(u => ({ name: u.name, dept: u.department })));

    process.exit(0);
});
