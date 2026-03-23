import Application from '../models/Application.js';

// @desc    Add a newly submitted job application
// @route   POST /api/analytics
export const addApplication = async (req, res, next) => {
  try {
    const { jobTitle, company, jobLink, companyLink, status } = req.body;

    const application = await Application.create({
      user: req.user._id,
      jobTitle,
      company,
      jobLink,
      companyLink,
      status: status || 'Applied'
    });

    res.status(201).json(application);
  } catch (error) { 
    next(error); 
  }
};

// @desc    Get user's application stats and list
// @route   GET /api/analytics
export const getAnalytics = async (req, res, next) => {
  try {
    // 1. Fetch all applications for this user, sorted newest first
    const applications = await Application.find({ user: req.user._id }).sort({ dateApplied: -1 });

    // 2. Calculate Dates for filtering
    const now = new Date();
    
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const startOfMonth = new Date(now.getTime());
    startOfMonth.setDate(now.getDate() - 30); // Last 30 days

    // 3. Calculate Stats
    let todayCount = 0;
    let monthCount = 0;
    const totalCount = applications.length;

    applications.forEach(app => {
      const appDate = new Date(app.dateApplied);
      if (appDate >= startOfToday) todayCount++;
      if (appDate >= startOfMonth) monthCount++;
    });

    // 4. Send back the compiled dashboard data
    res.status(200).json({
      stats: {
        today: todayCount,
        monthly: monthCount,
        total: totalCount
      },
      applications // The full array to display in the list/board
    });
  } catch (error) { 
    next(error); 
  }
};

// @desc    Delete a tracked application (if user made a mistake)
// @route   DELETE /api/analytics/:id
export const deleteApplication = async (req, res, next) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      res.status(404);
      throw new Error('Application not found');
    }

    // Ensure the user actually owns this application record
    if (application.user.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error('Not authorized to delete this record');
    }

    await application.deleteOne();
    res.status(200).json({ message: 'Application removed from tracking' });
  } catch (error) { 
    next(error); 
  }
};