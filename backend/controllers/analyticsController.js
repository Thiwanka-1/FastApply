import AutofillLog from '../models/AutofillLog.js';
import User from '../models/User.js';

// ==========================================
// USER ANALYTICS FUNCTIONS
// ==========================================

// @desc    Log a new autofilled job application
// @route   POST /api/analytics
export const logAutofill = async (req, res, next) => {
  try {
    const { jobTitle, company, jobUrl } = req.body;
    const log = await AutofillLog.create({ user: req.user._id, jobTitle, company, jobUrl });
    res.status(201).json(log);
  } catch (error) { next(error); }
};

// @desc    Get user's personal analytics & history
// @route   GET /api/analytics
export const getUserAnalytics = async (req, res, next) => {
  try {
    const logs = await AutofillLog.find({ user: req.user._id }).sort({ dateLogged: -1 });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getTime());
    startOfMonth.setDate(now.getDate() - 30);

    let todayCount = 0;
    let monthCount = 0;

    logs.forEach(log => {
      const logDate = new Date(log.dateLogged);
      if (logDate >= startOfToday) todayCount++;
      if (logDate >= startOfMonth) monthCount++;
    });

    res.status(200).json({
      stats: { today: todayCount, monthly: monthCount, total: logs.length },
      history: logs 
    });
  } catch (error) { next(error); }
};

// @desc    Update a specific log (e.g., fix a typo in the company name)
// @route   PUT /api/analytics/:id
export const updateLog = async (req, res, next) => {
  try {
    let log = await AutofillLog.findById(req.params.id);
    if (!log || log.user.toString() !== req.user._id.toString()) {
      res.status(404);
      throw new Error('Log not found or unauthorized');
    }
    
    log.jobTitle = req.body.jobTitle || log.jobTitle;
    log.company = req.body.company || log.company;
    log.jobUrl = req.body.jobUrl || log.jobUrl;
    
    const updatedLog = await log.save();
    res.status(200).json(updatedLog);
  } catch (error) { next(error); }
};

// @desc    Delete a single log
// @route   DELETE /api/analytics/:id
export const deleteLog = async (req, res, next) => {
  try {
    const log = await AutofillLog.findById(req.params.id);
    if (!log || log.user.toString() !== req.user._id.toString()) {
      res.status(404);
      throw new Error('Log not found or unauthorized');
    }
    await log.deleteOne();
    res.status(200).json({ message: 'Autofill log removed' });
  } catch (error) { next(error); }
};

// @desc    Clear ALL autofill history for the user
// @route   DELETE /api/analytics/clear-history
export const clearUserHistory = async (req, res, next) => {
  try {
    await AutofillLog.deleteMany({ user: req.user._id });
    res.status(200).json({ message: 'All autofill history cleared successfully' });
  } catch (error) { next(error); }
};

// ==========================================
// ADMIN ANALYTICS FUNCTIONS
// ==========================================

// @desc    Get global platform analytics (Admin Only)
// @route   GET /api/analytics/admin/global
export const getGlobalAnalytics = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalAutofills = await AutofillLog.countDocuments();
    
    // Advanced Aggregation: Get the top 5 most popular companies users are applying to
    const topCompanies = await AutofillLog.aggregate([
      { $group: { _id: "$company", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.status(200).json({
      platformStats: { totalUsers, totalAutofills },
      topCompanies
    });
  } catch (error) { next(error); }
};