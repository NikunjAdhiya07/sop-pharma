import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import MCQBankTestResult from '@/models/MCQBankTestResult';
import SOP from '@/models/SOP';

export async function GET(request: Request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department');
    const sopId = searchParams.get('sopId');
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const sortBy = searchParams.get('sortBy') || 'pendingTests';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Fetch all SOPs
    const sops = await SOP.find({}).lean();
    
    // Fetch all users
    let userQuery: any = {};
    if (department && department !== 'all') {
      userQuery.department = department;
    }
    if (userId && userId !== 'all') {
      userQuery._id = userId;
    }
    const users = await User.find(userQuery).lean();

    // Fetch test results with filters
    let testQuery: any = {};
    if (startDate || endDate) {
      testQuery.completedAt = {};
      if (startDate) testQuery.completedAt.$gte = new Date(startDate);
      if (endDate) testQuery.completedAt.$lte = new Date(endDate);
    }

    const testResults = await MCQBankTestResult.find(testQuery)
      .populate('userId', 'name username department role')
      .lean();

    // Calculate SOP-wise statistics
    const sopStats = sops.map((sop: any) => {
      const sopTests = testResults.filter((test: any) => 
        test.sopIdentifier === sop.identifier
      );

      const totalUsers = users.length;
      const completedUsers = new Set(
        sopTests
          .filter((test: any) => test.status === 'completed')
          .map((test: any) => test.userId?._id?.toString())
      ).size;
      const pendingUsers = totalUsers - completedUsers;

      const passedTests = sopTests.filter((test: any) => test.isPassed).length;
      const failedTests = sopTests.filter((test: any) => test.status === 'completed' && !test.isPassed).length;
      
      const avgScore = sopTests.length > 0
        ? sopTests.reduce((sum: number, test: any) => sum + (test.score || 0), 0) / sopTests.length
        : 0;

      return {
        sopId: sop._id,
        sopName: sop.sopName,
        sopIdentifier: sop.sopIdentifier,
        department: sop.department,
        totalUsers,
        completedUsers,
        pendingUsers,
        completionRate: totalUsers > 0 ? (completedUsers / totalUsers) * 100 : 0,
        totalTests: sopTests.length,
        passedTests,
        failedTests,
        averageScore: avgScore,
        targetProgress: {
          total: totalUsers,
          completed: completedUsers,
          pending: pendingUsers,
          percentage: totalUsers > 0 ? (completedUsers / totalUsers) * 100 : 0
        }
      };
    });

    // Apply filters
    let filteredStats = sopStats;
    if (sopId && sopId !== 'all') {
      filteredStats = filteredStats.filter((stat: any) => stat.sopId.toString() === sopId);
    }
    if (department && department !== 'all') {
      filteredStats = filteredStats.filter((stat: any) => stat.department === department);
    }
    if (status) {
      if (status === 'completed') {
        filteredStats = filteredStats.filter((stat: any) => stat.completionRate === 100);
      } else if (status === 'pending') {
        filteredStats = filteredStats.filter((stat: any) => stat.pendingUsers > 0);
      }
    }

    // Apply sorting
    filteredStats.sort((a: any, b: any) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'pendingTests':
          aVal = a.pendingUsers;
          bVal = b.pendingUsers;
          break;
        case 'completionRate':
          aVal = a.completionRate;
          bVal = b.completionRate;
          break;
        case 'averageScore':
          aVal = a.averageScore;
          bVal = b.averageScore;
          break;
        case 'sopName':
          return sortOrder === 'asc' 
            ? a.sopName.localeCompare(b.sopName)
            : b.sopName.localeCompare(a.sopName);
        case 'department':
          return sortOrder === 'asc'
            ? a.department.localeCompare(b.department)
            : b.department.localeCompare(a.department);
        default:
          aVal = a.pendingUsers;
          bVal = b.pendingUsers;
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Department-wise statistics
    const departments = [...new Set(sops.map((sop: any) => sop.department))];
    const departmentStats = departments.map(dept => {
      const deptSOPs = filteredStats.filter((stat: any) => stat.department === dept);
      const totalPending = deptSOPs.reduce((sum: any, stat: any) => sum + stat.pendingUsers, 0);
      const totalCompleted = deptSOPs.reduce((sum: any, stat: any) => sum + stat.completedUsers, 0);
      const avgCompletion = deptSOPs.length > 0
        ? deptSOPs.reduce((sum: any, stat: any) => sum + stat.completionRate, 0) / deptSOPs.length
        : 0;

      return {
        department: dept,
        totalSOPs: deptSOPs.length,
        totalPendingTests: totalPending,
        totalCompletedTests: totalCompleted,
        averageCompletion: avgCompletion
      };
    });

    // User-wise statistics
    const userStats = users.map((user: any) => {
      const userTests = testResults.filter((test: any) => 
        test.userId?._id?.toString() === user._id.toString()
      );

      const completedTests = userTests.filter((test: any) => test.status === 'completed').length;
      const pendingTests = sops.length - completedTests;
      const passedTests = userTests.filter((test: any) => test.isPassed).length;
      const avgScore = userTests.length > 0
        ? userTests.reduce((sum: number, test: any) => sum + (test.score || 0), 0) / userTests.length
        : 0;

      return {
        userId: user._id,
        name: user.name,
        username: user.username,
        department: user.department,
        role: user.role,
        completedTests,
        pendingTests,
        passedTests,
        averageScore: avgScore,
        completionRate: sops.length > 0 ? (completedTests / sops.length) * 100 : 0
      };
    });

    // Overall statistics
    const totalPendingTests = filteredStats.reduce((sum: any, stat: any) => sum + stat.pendingUsers, 0);
    const totalCompletedTests = filteredStats.reduce((sum: any, stat: any) => sum + stat.completedUsers, 0);
    const overallCompletion = filteredStats.length > 0
      ? filteredStats.reduce((sum: any, stat: any) => sum + stat.completionRate, 0) / filteredStats.length
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        sopStats: filteredStats,
        departmentStats,
        userStats,
        overall: {
          totalSOPs: filteredStats.length,
          totalUsers: users.length,
          totalPendingTests,
          totalCompletedTests,
          overallCompletion,
          totalDepartments: departments.length
        },
        filters: {
          departments,
          sops: sops.map((sop: any) => ({
            _id: sop._id,
            sopName: sop.sopName,
            sopIdentifier: sop.sopIdentifier,
            department: sop.department
          })),
          users: users.map((user: any) => ({
            _id: user._id,
            name: user.name,
            username: user.username,
            department: user.department
          }))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching admin analytics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}
