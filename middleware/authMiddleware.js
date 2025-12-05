// authMiddleware.js

// Middleware to verify if the user is a Meal Supplier (API Protection)
export const verifySupplier = (req, res, next) => {
  // 1. Check for valid session data
  if (!req.session || !req.session.userId || !req.session.role) {
    // Return 401 Unauthorized if no valid session/login data exists
    return res.status(401).json({ 
      message: 'Unauthorized: Session required. Please log in.', 
      code: 'UNAUTHORIZED' 
    });
  }

  // 2. Check if the role is 'meal_supplier'
  if (req.session.role !== 'meal_supplier') {
    // Return 403 Forbidden if the user is logged in but is the wrong role
    return res.status(403).json({ 
      message: 'Forbidden: Access limited to meal suppliers only.', 
      code: 'FORBIDDEN' 
    });
  }

  // Success: Proceed to the route handler
  next();
};


// Your existing middleware (for reference)
export const verifyAdmin = (req, res, next) => {
  if (!req.session || !req.session.userId || req.session.role !== "admin") {
    return res.redirect("/admin-login.html"); // Redirect for HTML pages
  }
  next();
};