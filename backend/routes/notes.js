// routes/notes.js — sql.js version
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { run, get } from '../db.js';
import authMiddleware from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, (req,res) => {
  const note=get('SELECT content FROM notes WHERE user_id=?',[req.user.id]);
  res.json({content:note?.content||''});
});

router.put('/', authMiddleware, (req,res) => {
  const {content}=req.body;
  if (content===undefined) return res.status(400).json({error:'content required'});
  const existing=get('SELECT id FROM notes WHERE user_id=?',[req.user.id]);
  if (existing) {
    run("UPDATE notes SET content=?,updated_at=datetime('now') WHERE user_id=?",[content,req.user.id]);
  } else {
    run('INSERT INTO notes(id,content,user_id) VALUES(?,?,?)',[uuid(),content,req.user.id]);
  }
  res.json({content});
});

export default router;
