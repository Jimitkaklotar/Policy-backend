const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// GET /api/tasks
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const tasks = await db.collection('tasks').find({}).toArray();
    
    // Sort tasks: To Do -> In Progress -> Completed, and then by high priority first
    const priorityWeight = { High: 3, Medium: 2, Low: 1 };
    
    tasks.sort((a, b) => {
      // Sort by status completed last
      if (a.status === 'Completed' && b.status !== 'Completed') return 1;
      if (a.status !== 'Completed' && b.status === 'Completed') return -1;
      
      // Sort by priority weight
      const pA = priorityWeight[a.priority] || 0;
      const pB = priorityWeight[b.priority] || 0;
      if (pA !== pB) return pB - pA;
      
      // Sort by due date
      return a.dueDate.localeCompare(b.dueDate);
    });
    
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching tasks', error: error.message });
  }
});

// POST /api/tasks
router.post('/', authMiddleware, async (req, res) => {
  const { title, dueDate, priority, status } = req.body;
  if (!title) {
    return res.status(400).json({ message: 'Title is required' });
  }

  const newTask = {
    id: 'task-' + Math.floor(1000 + Math.random() * 9000),
    title,
    dueDate: dueDate || new Date().toISOString().split('T')[0],
    priority: priority || 'Medium',
    status: status || 'To Do',
    createdAt: new Date().toISOString()
  };

  try {
    const db = getDb();
    await db.collection('tasks').insertOne(newTask);
    res.status(201).json(newTask);
  } catch (error) {
    res.status(500).json({ message: 'Error creating task', error: error.message });
  }
});

// PUT /api/tasks/:id
router.put('/:id', authMiddleware, async (req, res) => {
  const { title, dueDate, priority, status } = req.body;
  try {
    const db = getDb();
    const task = await db.collection('tasks').findOne({ id: req.params.id });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const updatedFields = {};
    if (title !== undefined) updatedFields.title = title;
    if (dueDate !== undefined) updatedFields.dueDate = dueDate;
    if (priority !== undefined) updatedFields.priority = priority;
    if (status !== undefined) updatedFields.status = status;

    await db.collection('tasks').updateOne({ id: req.params.id }, { $set: updatedFields });
    const updatedTask = { ...task, ...updatedFields };
    
    // Remove _id for JSON output consistency
    delete updatedTask._id;
    
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ message: 'Error updating task', error: error.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.collection('tasks').deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting task', error: error.message });
  }
});

module.exports = router;
