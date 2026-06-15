// middleware/auth.js
import jwt from 'jsonwebtoken';
import { get, fromJson } from '../db.js';

export default function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({error:'No token provided'});
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = get('SELECT * FROM users WHERE id=?', [decoded.userId]);
    if (!user) return res.status(401).json({error:'User not found'});
    req.user = { id:user.id, name:user.name, email:user.email, role:user.role,
      subjects:fromJson(user.subjects,[]), goals:fromJson(user.goals,[]) };
    next();
  } catch(err) {
    if (err.name==='TokenExpiredError') return res.status(401).json({error:'Token expired'});
    return res.status(401).json({error:'Invalid token'});
  }
}
