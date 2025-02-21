const express = require("express");
const dotenv = require("dotenv");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");

const port = process.env.PORT || 3000;
const app = express();
dotenv.config();
app.use(express.json());
app.use(helmet());
app.use(morgan("dev"));
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://task-manager-38.web.app",
      "https://task-manager-38.firebaseapp.com",
    ],
  })
);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.0b1vd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db("task-manager");

async function run() {
  try {
    const usersCollection = db.collection("users");
    const taskCollection = db.collection("tasks");
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
    app.get("/", (req, res) => {
      res.send("Task manager homepage");
    });
    app.post("/auth/login", async (req, res) => {
      const user = req.body || {};

      try {
        // check if the user already exists, if exists then return the user
        const existingUser = await usersCollection.findOne({
          email: user?.email,
        });
        if (existingUser) {
          return res.status(200).json({
            success: true,
            error: false,
            type: "existing",
            message: "User added successfully",
            data: existingUser,
          });
        }
        // if the user doesn't exist, then add the user to the database
        const result = await usersCollection.insertOne(user);
        res.status(201).json({
          success: true,
          error: false,
          type: "new",
          message: "User added successfully",
          data: result,
        });
      } catch (error) {
        console.log(error);
      }
    });

    app.post("/add-task", async (req, res) => {
      const task = req.body;
      task.timestamp = new Date(task.timestamp);
      try {
        const result = await taskCollection.insertOne(task);
        res.status(201).json({
          success: true,
          error: false,
          message: "Task added successfully",
          data: result,
        });
      } catch (error) {
        console.log(error);
      }
    });

    // get all the task of a user like the format const tasks= [{category:todo, task:[{},{}]}, {category:inProgress, task:[{},{}]}, {category:done, task:[{},{}]}]

    app.get("/tasks/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);

      try {
        const tasks = await taskCollection
          .aggregate([
            { $match: { user: email } },
            {
              $group: {
                _id: "$category",
                tasks: { $push: "$$ROOT" },
              },
            },
            {
              $addFields: {
                sortOrder: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$_id", "todo"] }, then: 1 },
                      { case: { $eq: ["$_id", "inProgress"] }, then: 2 },
                      { case: { $eq: ["$_id", "done"] }, then: 3 },
                    ],
                    default: 4,
                  },
                },
              },
            },
            { $sort: { sortOrder: 1 } },
            {
              $project: {
                _id: 0,
                category: "$_id",
                tasks: 1,
              },
            },
          ])
          .toArray();

        // Ensure all categories are included
        const categories = ["todo", "inProgress", "done"];

        const formattedTasks = categories.map((category) => {
          const categoryTasks = tasks.find(
            (task) => task.category === category
          );

          return {
            category,
            tasks: categoryTasks ? categoryTasks.tasks : [],
          };
        });

        res.status(200).json({
          success: true,
          error: false,
          message: "Tasks retrieved successfully",
          data: formattedTasks,
        });
      } catch (error) {
        console.log(error);
        res.status(500).json({
          success: false,
          error: true,
          message: "Failed to retrieve tasks",
        });
      }
    });

    // delete a task
    app.delete("/tasks/delete/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await taskCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.status(200).json({
          success: true,
          error: false,
          message: "Task deleted successfully",
          data: result,
        });
      } catch (error) {
        console.log(error);
        res.status(500).json({
          success: false,
          error: true,
          message: "Failed to delete task",
        });
      }
    });

    // update a task

    app.put("/tasks/update/:id", async (req, res) => {
      const id = req.params?.id;
      const task = req.body;

      if (!task || !id) {
        return res.status(404).send({
          error: true,
          message: "task not found",
        });
      }

      task.modified = new Date(task.modified);

      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: task,
      };

      try {
        const result = await taskCollection.findOneAndUpdate(
          filter,
          updateDoc,
          { returnDocument: "after" }
        );
        console.log(result);
        res.status(201).send({
          success: true,
          error: false,
          message: "Successfully updated the task",
          data: result,
        });
      } catch (error) {
        console.log(error);
        res.status(500).send({
          success: false,
          error: true,
          message: "Failed to update task",
        });
      }
    });

    // update category for drag and drop

    app.put("/tasks/dnd/:_id", async (req, res) => {
      const id = req.params?._id;
      const task = req.body;

      if (!task || !id) {
        return res.status(404).send({
          error: true,
          message: "task not found",
        });
      }
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: { category: task.category },
      };

      try {
        const result = await taskCollection.findOneAndUpdate(
          filter,
          updateDoc,
          { returnDocument: "after" }
        );
        res.status(201).send({
          success: true,
          error: false,
          message: "Successfully updated the task",
          data: result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          error: true,
          message: "Failed to update task",
        });
      }
    });

    // get a single task
    app.get("/tasks/single-task/:id", async (req, res) => {
      const id = req.params?.id;

      if (!id) {
        return res.status(404).send({
          error: true,
          message: "task not found",
        });
      }

      try {
        const result = await taskCollection.findOne({ _id: new ObjectId(id) });
        res.status(201).send({
          success: true,
          error: false,
          message: "Successfully got the task",
          data: result,
        });
      } catch {
        res.status(500).send({
          success: false,
          error: true,
          message: "Failed to update task",
        });
      }
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
