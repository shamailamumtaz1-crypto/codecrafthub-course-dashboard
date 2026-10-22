
/**
 * CodeCraftHub - Personal Learning Goal Tracker API
 * REST API for managing courses and learning goals.
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

const DATA_FILE = path.join(__dirname, "courses_sample.json");
const PORT = 5000;

// Middleware
app.use(cors({
  origin: "http://localhost:5173"
}));

app.use(express.json());

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Load courses from the JSON file.
 */
function loadCourses() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, "[]", "utf8");
      return [];
    }

    const data = fs.readFileSync(DATA_FILE, "utf8");
    const courses = JSON.parse(data);

    if (!Array.isArray(courses)) {
      throw new Error("Course data must be a JSON array.");
    }

    return courses;
  } catch (error) {
    console.error("Error reading courses file:", error);
    throw error;
  }
}

/**
 * Save courses to the JSON file.
 */
function saveCourses(courses) {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(courses, null, 2),
      "utf8"
    );

    return true;
  } catch (error) {
    console.error("Error saving courses:", error);
    return false;
  }
}

/**
 * Generate the next available course ID.
 */
function getNextId(courses) {
  if (courses.length === 0) {
    return 1;
  }

  return Math.max(...courses.map((course) => course.id)) + 1;
}

/**
 * Find a course by ID.
 */
function findCourseById(courses, courseId) {
  const index = courses.findIndex(
    (course) => course.id === courseId
  );

  if (index === -1) {
    return { course: null, index: -1 };
  }

  return { course: courses[index], index };
}

/**
 * Validate course data.
 */
function validateCourseData(data, requiredFields = []) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return {
      isValid: false,
      errorMessage: "Request body must be a JSON object.",
    };
  }

  const missingFields = requiredFields.filter(
    (field) =>
      typeof data[field] !== "string" ||
      data[field].trim() === ""
  );

  if (missingFields.length > 0) {
    return {
      isValid: false,
      errorMessage:
        `Missing or empty required fields: ${missingFields.join(", ")}`,
    };
  }

  const validStatuses = [
    "Not Started",
    "In Progress",
    "Completed",
  ];

  if (
    "status" in data &&
    !validStatuses.includes(data.status)
  ) {
    return {
      isValid: false,
      errorMessage:
        `Status must be one of: ${validStatuses.join(", ")}`,
    };
  }

  if ("target_date" in data) {
    const date = data.target_date;

    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      return {
        isValid: false,
        errorMessage: "target_date must use YYYY-MM-DD format.",
      };
    }

    const parsedDate = new Date(`${date}T00:00:00Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return {
        isValid: false,
        errorMessage: "target_date must be a valid calendar date.",
      };
    }
  }

  return { isValid: true, errorMessage: null };
}

/**
 * Parse and validate a course ID.
 */
function parseCourseId(value) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// ============================================================
// HOME ENDPOINT
// ============================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to CodeCraftHub API!",
    version: "1.0",
    endpoints: {
      "GET /api/courses": "Get all courses",
      "GET /api/courses/stats": "Get course statistics",
      "GET /api/courses/search?q=python": "Search courses",
      "GET /api/courses/:id": "Get a course by ID",
      "POST /api/courses": "Create a course",
      "PUT /api/courses/:id": "Update a course",
      "DELETE /api/courses/:id": "Delete a course",
    },
  });
});

// ============================================================
// GET ALL COURSES
// ============================================================

app.get("/api/courses", (req, res, next) => {
  try {
    const courses = loadCourses();

    res.status(200).json({
      success: true,
      count: courses.length,
      courses,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// CREATE A COURSE
// ============================================================

app.post("/api/courses", (req, res, next) => {
  try {
    const data = req.body;

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: "No valid JSON data provided.",
      });
    }

    const requiredFields = [
      "name",
      "description",
      "target_date",
      "status",
    ];

    const { isValid, errorMessage } = validateCourseData(
      data,
      requiredFields
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }

    const courses = loadCourses();

    const newCourse = {
      id: getNextId(courses),
      name: data.name.trim(),
      description: data.description.trim(),
      target_date: data.target_date,
      status: data.status,
      created_at: new Date()
        .toISOString()
        .replace("T", " ")
        .substring(0, 19),
    };

    courses.push(newCourse);

    if (!saveCourses(courses)) {
      return res.status(500).json({
        success: false,
        error: "Failed to save course.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Course added successfully.",
      course: newCourse,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// COURSE STATISTICS
// IMPORTANT: Keep this before /api/courses/:id
// ============================================================

app.get("/api/courses/stats", (req, res, next) => {
  try {
    const courses = loadCourses();

    const statistics = {
      total_courses: courses.length,
      not_started: courses.filter(
        (course) => course.status === "Not Started"
      ).length,
      in_progress: courses.filter(
        (course) => course.status === "In Progress"
      ).length,
      completed: courses.filter(
        (course) => course.status === "Completed"
      ).length,
    };

    return res.status(200).json({
      success: true,
      statistics,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// SEARCH COURSES
// IMPORTANT: Keep this before /api/courses/:id
// ============================================================

app.get("/api/courses/search", (req, res, next) => {
  try {
    const searchQuery = (
      req.query.q || ""
    ).trim().toLowerCase();

    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required.',
      });
    }

    const courses = loadCourses();

    const results = courses.filter((course) => {
      const name = (course.name || "").toLowerCase();
      const description = (
        course.description || ""
      ).toLowerCase();

      return (
        name.includes(searchQuery) ||
        description.includes(searchQuery)
      );
    });

    return res.status(200).json({
      success: true,
      count: results.length,
      courses: results,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET A COURSE BY ID
// ============================================================

app.get("/api/courses/:id", (req, res, next) => {
  try {
    const courseId = parseCourseId(req.params.id);

    if (courseId === null) {
      return res.status(400).json({
        success: false,
        error: "Course ID must be a positive integer.",
      });
    }

    const courses = loadCourses();
    const { course } = findCourseById(courses, courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        error: `Course with ID ${courseId} not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      course,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// UPDATE A COURSE
// ============================================================

app.put("/api/courses/:id", (req, res, next) => {
  try {
    const courseId = parseCourseId(req.params.id);

    if (courseId === null) {
      return res.status(400).json({
        success: false,
        error: "Course ID must be a positive integer.",
      });
    }

    const data = req.body;

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: "No valid update data provided.",
      });
    }

    const allowedFields = [
      "name",
      "description",
      "target_date",
      "status",
    ];

    const invalidFields = Object.keys(data).filter(
      (field) => !allowedFields.includes(field)
    );

    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Unsupported fields: ${invalidFields.join(", ")}`,
      });
    }

    const { isValid, errorMessage } = validateCourseData(
      data,
      []
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }

    const courses = loadCourses();
    const { course, index } = findCourseById(
      courses,
      courseId
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        error: `Course with ID ${courseId} not found.`,
      });
    }

    if ("name" in data) {
      if (
        typeof data.name !== "string" ||
        !data.name.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: "Course name cannot be empty.",
        });
      }

      course.name = data.name.trim();
    }

    if ("description" in data) {
      if (
        typeof data.description !== "string" ||
        !data.description.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: "Course description cannot be empty.",
        });
      }

      course.description = data.description.trim();
    }

    if ("target_date" in data) {
      course.target_date = data.target_date;
    }

    if ("status" in data) {
      course.status = data.status;
    }

    courses[index] = course;

    if (!saveCourses(courses)) {
      return res.status(500).json({
        success: false,
        error: "Failed to save course updates.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Course updated successfully.",
      course,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// DELETE A COURSE
// ============================================================

app.delete("/api/courses/:id", (req, res, next) => {
  try {
    const courseId = parseCourseId(req.params.id);

    if (courseId === null) {
      return res.status(400).json({
        success: false,
        error: "Course ID must be a positive integer.",
      });
    }

    const courses = loadCourses();
    const { course, index } = findCourseById(
      courses,
      courseId
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        error: `Course with ID ${courseId} not found.`,
      });
    }

    const deletedCourse = courses.splice(index, 1)[0];

    if (!saveCourses(courses)) {
      return res.status(500).json({
        success: false,
        error: "Failed to save course changes.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Course deleted successfully.",
      deleted_course: deletedCourse,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// 404 HANDLER
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found.",
  });
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  console.error("API error:", err);

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      error: "Invalid JSON request body.",
    });
  }

  return res.status(500).json({
    success: false,
    error: "Internal server error.",
  });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log("=".repeat(55));
  console.log("CodeCraftHub API is running.");
  console.log("=".repeat(55));
  console.log(`Data file: ${path.resolve(DATA_FILE)}`);
  console.log(`API URL: http://localhost:${PORT}`);
  console.log("Press CTRL+C to stop the server.");
  console.log("=".repeat(55));
});
