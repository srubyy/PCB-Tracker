import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretactivationkey2026!';

export const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1]; // Bearer <token>
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(401).json({ error: "Access token is invalid or expired." });
      }
      if (user && (user.role === 'Superadmin' || user.role === 'Manager')) {
        user.role = 'Team Lead';
      }
      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ error: "Authorization header is missing." });
  }
};

export const authorize = (allowedRoles) => {
  return (req, res, next) => {
    let userRole = req.user?.role;
    if (userRole === 'Superadmin' || userRole === 'Manager') {
      userRole = 'Team Lead';
    }
    if (!req.user || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    }
    next();
  };
};
