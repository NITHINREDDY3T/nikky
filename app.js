const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();
require('dotenv').config();

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
});

const User = mongoose.model('User', userSchema);

const postSchema = new mongoose.Schema({
  title: String,
  link: String,
  category: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  likes: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
  ],
  dislikes: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
  ],
  timestamp: {
    type: Date,
    default: Date.now,
  },
  comments: [
    {
      text: String,
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
  ],
});

const Post = mongoose.model('Post', postSchema);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

function timeAgo(timestamp) {
  // Function code here (same as in your original code)
}

app.get('/register', (req, res) => {
  res.render('login-register', { error: null });
});

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.render('login-register', { error: 'Email already registered' });
    }

    const newUser = new User({
      username,
      email,
      password, // Replace with your registration logic (e.g., hashing password)
    });

    await newUser.save();
    console.log('User registered successfully.');
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .render('login-register', { error: 'Internal server error' });
  }
});

app.get('/login', (req, res) => {
  res.render('login-register', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.render('login-register', { error: 'Invalid email or password' });
    }

    // Replace with your login logic (e.g., password comparison)
    if (password !== user.password) {
      return res.render('login-register', { error: 'Invalid email or password' });
    }

    req.session.user = user;

    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .render('login-register', { error: 'Internal server error' });
  }
});

app.get('/dashboard', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const { search, category } = req.query;
  const filter = {};

  if (search) {
    filter.title = { $regex: new RegExp(search, 'i') };
  }

  if (category && category !== 'All') {
    filter.category = category;
  }

  try {
    const posts = await Post.find(filter)
      .populate('userId', 'username')
      .populate('comments.userId', 'username')
      .sort({ timestamp: -1 });

    const categorizedPosts = {};

    posts.forEach((post) => {
      if (!categorizedPosts[post.category]) {
        categorizedPosts[post.category] = [];
      }
      categorizedPosts[post.category].push(post);
    });

    res.render('dashboard', {
      user: req.session.user,
      posts: categorizedPosts,
      error: null,
      timeAgo,
      search,
      selectedCategory: category || 'All',
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('dashboard', {
      user: req.session.user,
      posts: {},
      error: 'Error fetching posts',
      timeAgo,
      search: '',
      selectedCategory: 'All',
    });
  }
});

app.get('/search', async (req, res) => {
  const { search } = req.query;

  try {
    const results = await Post.find({ title: { $regex: search, $options: 'i' } });

    res.render('search-results', { results });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
    }
    res.redirect('/login');
  });
});

app.post('/post-description', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const { title, link, category } = req.body;
  const userId = req.session.user._id;

  try {
    const newPost = new Post({
      title,
      link,
      category,
      userId,
      likes: [],
      dislikes: [],
      comments: [],
    });

    await newPost.save();
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .render('dashboard', {
        user: req.session.user,
        posts: {},
        error: 'Error posting description',
        timeAgo,
        search: '',
      });
  }
});

app.get('/like-post/:id', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  try {
    const postId = req.params.id;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send('Post not found');
    }

    const userId = req.session.user._id;

    if (post.likes.some((like) => like.userId.equals(userId))) {
      return res.status(400).send('You have already liked this post');
    }

    const userDislikeIndex = post.dislikes.findIndex((dislike) =>
      dislike.userId.equals(userId)
    );
    if (userDislikeIndex !== -1) {
      post.dislikes.splice(userDislikeIndex, 1);
    }

    post.likes.push({ userId });
    await post.save();
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

app.get('/dislike-post/:id', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  try {
    const postId = req.params.id;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send('Post not found');
    }

    const userId = req.session.user._id;

    if (post.dislikes.some((dislike) => dislike.userId.equals(userId))) {
      return res.status(400).send('You have already disliked this post');
    }

    const userLikeIndex = post.likes.findIndex((like) =>
      like.userId.equals(userId)
    );
    if (userLikeIndex !== -1) {
      post.likes.splice(userLikeIndex, 1);
    }

    post.dislikes.push({ userId });
    await post.save();
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

app.post('/comment/:id', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  try {
    const postId = req.params.id;
    const { text } = req.body;
    const userId = req.session.user._id;

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send('Post not found');
    }

    if (post.comments.length >= 10) {
      return res.status(400).send('Maximum comment limit reached');
    }

    const newComment = {
      text,
      userId,
    };

    post.comments.push(newComment);
    await post.save();
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

app.post('/post-link', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const { title, link, category } = req.body;
  const userId = req.session.user._id;

  try {
    const newPost = new Post({
      title,
      link,
      category,
      userId,
      likes: [],
      dislikes: [],
      comments: [],
    });

    await newPost.save();
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).render('dashboard', {
      user: req.session.user,
      posts: {},
      error: 'Error posting description',
      timeAgo,
      search: '',
    });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
