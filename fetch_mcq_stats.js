/**
 * Script to fetch MCQ review statistics from the dashboard
 * Run: node fetch_mcq_stats.js
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

async function fetchMCQStats() {
  try {
    console.log('Fetching MCQ Review Statistics...\n');

    const response = await fetch(`${BASE_URL}/api/dashboard/mcq-review-stats`);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Unknown error occurred');
    }

    const { overall, byDepartment, reviewStatusBreakdown } = data;

    // Display Overall Stats
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                    MCQ REVIEW STATISTICS                    ');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('OVERALL SUMMARY:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`  Total Questions:        ${overall.totalQuestions.toString().padStart(10)}`);
    console.log(`  Reviewed:               ${overall.totalReviewed.toString().padStart(10)} ✓`);
    console.log(`  Not Reviewed:           ${overall.totalNotReviewed.toString().padStart(10)} ✗`);
    console.log(`  Review Percentage:      ${overall.reviewPercentage.toString().padStart(9)}%`);
    console.log(`  Total Departments:      ${overall.totalDepartments.toString().padStart(10)}`);
    console.log(`  Total SOPs:             ${overall.totalSOPs.toString().padStart(10)}`);
    console.log();

    // Display by Department
    console.log('BY DEPARTMENT:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`${'Department'.padEnd(20)} | ${'SOPs'.padEnd(6)} | ${'Total Q'.padEnd(8)} | ${'Reviewed'.padEnd(10)} | ${'Pending'.padEnd(9)} | ${'%'.padEnd(5)}`);
    console.log('─────────────────────────────────────────────────────────────');

    byDepartment.forEach((dept) => {
      const deptName = (dept.department || 'Unknown').padEnd(20);
      const sops = dept.totalSOPs.toString().padEnd(6);
      const totalQ = dept.totalQuestions.toString().padEnd(8);
      const reviewed = dept.reviewedQuestions.toString().padEnd(10);
      const pending = dept.notReviewedQuestions.toString().padEnd(9);
      const percentage = `${dept.reviewPercentage}%`.padEnd(5);

      console.log(`${deptName} | ${sops} | ${totalQ} | ${reviewed} | ${pending} | ${percentage}`);
    });
    console.log();

    // Display Review Status Breakdown
    if (Object.keys(reviewStatusBreakdown).length > 0) {
      console.log('REVIEW STATUS BREAKDOWN:');
      console.log('─────────────────────────────────────────────────────────────');
      Object.entries(reviewStatusBreakdown).forEach(([status, count]) => {
        console.log(`  ${status.charAt(0).toUpperCase() + status.slice(1).padEnd(15)}: ${count}`);
      });
      console.log();
    }

    // Display progress visualization
    console.log('VISUAL PROGRESS:');
    console.log('─────────────────────────────────────────────────────────────');
    const progressBar = createProgressBar(overall.reviewPercentage, 50);
    console.log(`  [${progressBar}] ${overall.reviewPercentage}%`);
    console.log(`   ${overall.totalReviewed}/${overall.totalQuestions} questions reviewed`);
    console.log();

    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('Error fetching MCQ stats:', error);
    process.exit(1);
  }
}

function createProgressBar(percentage, length = 50) {
  const filledLength = Math.round((percentage / 100) * length);
  const emptyLength = length - filledLength;
  return '█'.repeat(filledLength) + '░'.repeat(emptyLength);
}

fetchMCQStats();
