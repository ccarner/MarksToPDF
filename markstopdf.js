// Marks to PDF 2.0 - Canvas Edition
// by Alan Thomas, Canvas functionality added by Colton Carner [April 2020]
// for the School of Computing and Information Systems, University of Melbourne
// See README.md in this folder for more information on the project

// To generate PDFs, this script uses pdfmake, which has its own JSON-based
// markup for specifying content and formatting. The documentation is at
//   https://github.com/bpampuch/pdfmake#styling
// but the format is not fully documented there. More examples can be found at
//   http://pdfmake.org/playground.html

"use strict";

try {
  require("pdfmake");
} catch (e) {
  console.error(
    "You need to run the `npm install` command before you can run this script."
  );
  process.exit();
}

const chalk = require("chalk");
var PdfPrinter = require("pdfmake");
const path = require("path");
var fs = require("fs");
var csvParse = require("csv-parse");
var parseArgs = require("minimist"); // command-line parser
var stripJsonComments = require("strip-json-comments");
var nodemailer = require("nodemailer");
var promptly = require("promptly");
var dateformat = require("dateformat");

var versionString =
  "Marks to PDF CANVAS EDITION 1.1 by Alan Thomas and Colton Carner";

// Initial processing
console.log(versionString);

function printUsageMessage() {
  console.log(
    "\n\
usage: node markstopdf [--ids 123456,345678,...] [--mail n] --config config.json --csv marks.csv\n\
--ids list,of,ids     optional: only generate PDFs for the given student IDs\n\
--mail 1, --mail 2    optional: whether to email the generated PDFs\n\
                        --mail 1: send all the emails to the subject coordinator\n\
                        --mail 2: actually send an email to each student\n\
--config config.json  required: the JSON configuration file for this assignment [place in input folder]\n\
--csv marks.csv       required: the CSV file containing the marks data  [place in input folder]"
  );
  process.exit();
}

// Process command-line arguments
var argv = parseArgs(process.argv.slice(2), {
  string: ["ids", "config", "csv", "mail"],
  unknown: printUsageMessage,
});
var configJsonFileName = "input/" + argv.config;
var csvFileName = "input/" + argv.csv;
var mailMode = argv.mail ? parseInt(argv.mail) : 0;
if (!configJsonFileName || !csvFileName || [0, 1, 2].indexOf(mailMode) === -1) {
  printUsageMessage();
}
var idsToInclude = argv.ids ? argv.ids.split(",") : null;

// Set up a pdfmake PDF printer with Open Sans fonts
var printer = new PdfPrinter({
  OpenSans: {
    normal: "fonts/OpenSans-Regular.ttf",
    bold: "fonts/OpenSans-Bold.ttf",
    italics: "fonts/OpenSans-SemiBold.ttf", // abusing "italics" style for semibold
    bolditalics: "fonts/OpenSans-Bold.ttf",
  },
});

// Read the config JSON file
var config = JSON.parse(
  stripJsonComments(fs.readFileSync(configJsonFileName, "utf8"), {
    whitespace: false,
  })
);

// Perform some basic validation on the config JSON
function ensureConfigHasKey(key) {
  if (!config.hasOwnProperty(key)) {
    console.error(
      'Error: The config JSON file must contain a "' + key + '" key.'
    );
    process.exit();
  }
}

[
  "header",
  "footer",
  "assignmentName",
  "subjectCoordName",
  "maxMarksRowIndex",
  "columns",
].forEach(ensureConfigHasKey);

if (mailMode > 0) {
  ["subjectCoordEmail", "smtp", "emailSubject", "emailBody"].forEach(
    ensureConfigHasKey
  );
}

function ensureColumnsHasKey(key) {
  if (!config.columns.hasOwnProperty(key)) {
    if (key !== "personalFeedback") {
      console.error(
        'Error: In the config JSON file, the "columns" object must ' +
          'contain a "' +
          key +
          '" key.'
      );
      process.exit();
    } else {
      // not having personal feedback might be intentional
      console.warn(
        chalk.red(
          "Warn: No 'personal feedback' column key found." +
            "This might be intentional if no personal feedback was given"
        )
      );
    }
  }
}

[
  "studentNumber",
  "studentFirstName",
  "studentLastName",
  "criteriaSections",
  "totalMarks",
  "personalFeedback",
].forEach(ensureColumnsHasKey);

if (mailMode > 0) {
  ["studentEmail"].forEach(ensureColumnsHasKey);
}

// Log to the screen and optionally to disk.
var logFile = null;
function log(str) {
  console.log(str);
  if (!logFile && mailMode > 0) {
    // Open a log file if we are mailing out
    logFile = fs.createWriteStream(
      configJsonFileName.replace(
        /\.json$/i,
        "-" + dateformat(new Date(), "yyyymmdd-hhMMss") + ".log"
      ),
      { flags: "w" }
    );
  }
  if (logFile) {
    logFile.write(str + "\n");
  }
}

// Converts a spreadsheet column index (A, B, ..., Z, AA, AB, ..., AZ, BA, ...)
// to a zero-based numerical index.
function columnToIndex(column) {
  if (typeof column === "string") {
    if (column.length === 1) {
      var result = column.charCodeAt(0) - 65;
      if (result >= 0 && result <= 26) {
        return result;
      }
    } else if (column.length === 2) {
      var lowDigit = column.charCodeAt(1) - 65;
      if (lowDigit >= 0 && lowDigit <= 26) {
        var highDigit = column.charCodeAt(0) - 64;
        if (highDigit >= 0 && highDigit <= 26) {
          return lowDigit + highDigit * 26;
        }
      }
    }
  }

  throw (
    "Column index must be a string in spreadsheet format " +
    '(A, B, ..., Z, AA, AB, ..., AZ, BA, ...), not "' +
    column +
    '"'
  );
}

// Generates the table of criteria and marks for the given student.
function generateCriteriaTable(studentRow, maxMarksRow) {
  var result = [
    [
      { text: "Criterion", style: "semibold", fillColor: "#eeeeee" },
      { text: "Available\nmarks", style: "semibold", fillColor: "#eeeeee" },
      { text: "Your mark", style: "semibold", fillColor: "#eeeeee" },
    ],
  ];

  Object.keys(config.columns.criteriaSections).forEach(function (sectionTitle) {
    // Print a whole-row header for this criteria section
    result.push([{ colSpan: 3, text: sectionTitle, style: "semibold" }]);

    // Then print a row for each criterion in this section
    Object.keys(config.columns.criteriaSections[sectionTitle]).forEach(
      function (criterion) {
        var marksColumn = columnToIndex(
          config.columns.criteriaSections[sectionTitle][criterion]
        );
        var marks = studentRow[marksColumn];
        var maxMarks = maxMarksRow[marksColumn];

        result.push([
          { text: criterion, margin: [12, 0] },
          maxMarks || "",
          { text: marks, style: "semibold", color: "#0011cc" },
        ]);
      }
    );
  });

  var totalColumn = columnToIndex(config.columns.totalMarks);
  result.push([
    {
      text: "Overall mark for " + config.assignmentName,
      style: "semibold",
      fillColor: "#eeeeee",
    },
    { text: maxMarksRow[totalColumn], style: "semibold", fillColor: "#eeeeee" },
    {
      text: studentRow[totalColumn],
      color: "#0011cc",
      style: "bold",
      fillColor: "#eeeeee",
    },
  ]);

  return result;
}

// Generates a student PDF from a row of the CSV file.
function generateStudentPdf(studentRowIndex, maxMarksRow) {
  //number of students who were in the CSV, but didn't find a matching submission from canvas for them...
  var filenames = undefined;
  var canvasSubmissionFolder = "./input/canvas_submissions";
  var outputFolder = "./output";
  //make the output folder
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  var submissionpath = path.normalize(
    __dirname + "/" + canvasSubmissionFolder + "/"
  );

  //canvas needs us to have the same names when reuploading, so we need to find the names of the files.
  filenames = fs.readdirSync(submissionpath);

  function moveToNext(timeout) {
    if (++studentRowIndex >= csv.length) {
      log("");
      log(
        "Done. " +
          (mailMode
            ? mailMode === 2
              ? "Sent email to "
              : "Sent test emails relating to "
            : "Generated PDFs for ") +
          numSuccessful +
          " student" +
          (numSuccessful === 1 ? "." : "s.")
      );
      mailer && mailer.close();
      console.log(chalk.red("Number of students skipped was " + numSkipped));
    } else {
      // Generate the next one!
      setTimeout(
        generateStudentPdf.bind(this, studentRowIndex, maxMarksRow),
        timeout || 100
      );
    }
  }

  var studentRow = csv[studentRowIndex];

  var studentNumber = studentRow[columnToIndex(config.columns.studentNumber)];
  var studentFirstName =
    studentRow[columnToIndex(config.columns.studentFirstName)];
  var studentLastName =
    studentRow[columnToIndex(config.columns.studentLastName)];
  var studentEmail = studentRow[columnToIndex(config.columns.studentEmail)];
  var totalMarks = studentRow[columnToIndex(config.columns.totalMarks)];

  var studentNumberAsInt = parseInt(studentNumber, 10);

  // Is this student number blank or too small?
  if (isNaN(studentNumberAsInt) || studentNumberAsInt < 10000) {
    if (!studentFirstName && !studentLastName) {
      // Output nothing when ignoring a row with no first name, last name
      // or student number
    } else if (mailMode === 0) {
      // Print the letter "x" to indicate "invalid" when not in mail mode
      process.stdout.write("x");
    } else if (
      !idsToInclude ||
      idsToInclude.indexOf(studentNumber.trim()) !== -1
    ) {
      log(
        chalk.red(
          "\nSkipping " +
            studentFirstName +
            " " +
            studentLastName +
            " (" +
            studentNumber +
            ") <" +
            studentEmail +
            "> due to invalid student number"
        )
      );
    }

    // Skip to the next one! Because we did nothing, the timeout can be negligible
    moveToNext(1);
    return;
  }

  // Is the student's email address trivially invalid (no @ sign)?
  if (mailMode > 0 && studentEmail.indexOf("@") === -1) {
    if (!idsToInclude || idsToInclude.indexOf(studentNumber.trim()) !== -1) {
      log(
        "Skipping " +
          studentFirstName +
          " " +
          studentLastName +
          " (" +
          studentNumber +
          ") <" +
          studentEmail +
          "> due to invalid email address"
      );
    }

    // Skip to the next one! Because we did nothing, the timeout can be negligible
    moveToNext(1);
    return;
  }

  // Is this student number missing from the list of IDs to include?
  if (idsToInclude && idsToInclude.indexOf(studentNumber.trim()) === -1) {
    // Print the letter "S" to indicate "skipped" when not in mail mode
    if (mailMode === 0) {
      process.stdout.write("S");
    }

    // Skip to the next one! Because we did nothing, the timeout can be negligible
    moveToNext(1);
    return;
  }

  //below are adaptions for canvas: canvas needs to maintain the same file name used when the student submitted for the new PDF

  //   var pdfFileName = config.assignmentName + " - " + studentNumber + ".pdf";
  var pdfFileName = undefined;
  var canvasName = (studentLastName + studentFirstName)
    .toLowerCase()
    .replace(/[ '\-,`~]/g, "");
  var lastNameToMatch = studentLastName.toLowerCase().replace(/[ '\-,`~]/g, "");
  //eg Kah-sheng, O'brien, people with names with spaces in them.

  filenames.forEach((filename) => {
    //need to match student ID (might not be included, we ask students to name their submission but theyre a bit dull sometimes)
    if (filename.includes(studentNumber)) {
      var filenameFirstComponent = filename.split("_")[0];
      // also check that first component was something LIKE what we expected their student name to be...
      // only checking last name since some people use preferred first names, or have long names and so are truncated
      if (filenameFirstComponent.includes(lastNameToMatch)) {
        pdfFileName = filename;
      }
    }
  });

  if (pdfFileName == undefined) {
    //couldn't match their ID...
    filenames.forEach((filename) => {
      var filenameFirstComponent = filename.split("_")[0];
      if (filenameFirstComponent === canvasName) {
        pdfFileName = filename;
        console.log(
          chalk.red(
            "\nWARN: " +
              canvasName +
              " was identified by their name rather than ID+name, be wary of duplicates"
          )
        );
      }
    });
  }

  if (pdfFileName === undefined) {
    if (totalMarks != 0) {
      console.log(
        chalk.bgRed(
          "\nERROR: Can't find canvas submission for " +
            studentNumber +
            " " +
            studentFirstName +
            " " +
            studentLastName +
            "<canvas name: " +
            canvasName +
            " >" +
            " [Generated with prefix 'MISSING_CANVAS_SUBMISSION...'] (had a non-zero total score of " +
            totalMarks +
            ")"
        )
      );

      // still generate the file if non-0 score, was likely just manually submitted via email or such
      pdfFileName =
        "MISSING_CANVAS_SUBMISSION_" +
        studentNumber +
        "_" +
        studentLastName +
        "_" +
        studentFirstName +
        ".pdf";
    } else {
      console.log(
        chalk.red(
          "\nWARN: Can't find canvas submission for " +
            studentFirstName +
            " " +
            studentLastName +
            "<canvas name: " +
            canvasName +
            " >" +
            " [skipping] (had 0 total score, likely didn't submit)"
        )
      );
      // skipped only if they got 0
      numSkipped++;
      moveToNext(1);
      return;
    }
  } else {
    // in case students submitted eg an SQL file
    pdfFileName = pdfFileName.split(".")[0] + ".pdf";
  }

  // The definition of the PDF document, including metadata, content and styles
  var docDefinition = {
    info: {
      title: config.assignmentName + " feedback",
      author: config.subjectCoordName,
      creator: versionString,
    },
    content: [
      // Document header
      config.header,
      {
        text: [
          { text: config.assignmentName + " feedback for " },
          {
            text:
              studentFirstName +
              " " +
              studentLastName +
              " (" +
              studentNumber +
              ")",
            style: { bold: true },
          },
        ],
        style: {
          fontSize: 14,
          italics: true, // actually semibold
        },
        margin: [0, 10],
      },

      // Table of marks
      {
        table: {
          headerRows: 1,
          widths: ["auto", 62, 62],

          body: generateCriteriaTable(studentRow, maxMarksRow),
        },
      },

      // Personal feedback section
      config.columns.personalFeedback && {
        text: "Personal feedback",
        style: "semibold",
        margin: [0, 10],
      },
      config.columns.personalFeedback &&
        (studentRow[columnToIndex(config.columns.personalFeedback)] ||
          "No feedback was provided. Contact the subject coordinator for more information."),

      // Footer
      "",
      config.footer,
    ],
    styles: {
      semibold: {
        italics: true, // actually semibold
      },
      bold: {
        bold: true,
      },
    },
    defaultStyle: {
      font: "OpenSans",
      fontSize: 11,
    },
  };

  var pdfDoc = printer.createPdfKitDocument(docDefinition);
  pdfDoc.on("end", function () {
    // Send an email?
    if (mailMode > 0) {
      var message = {
        from:
          '"' +
          config.subjectCoordName.replace(/"/g, "'") +
          '" <' +
          config.subjectCoordEmail +
          ">",
        to: mailMode === 2 ? studentEmail : config.subjectCoordEmail,
        subject: config.emailSubject,
        text: config.emailBody.join("\n"),
        attachments: [
          {
            filename: pdfFileName,
            content: fs.createReadStream(pdfFileName),
            contentType: "application/pdf",
          },
        ],
      };

      mailer.sendMail(message, function (error, success) {
        if (!error && !success.rejected.length) {
          log(
            "Sent email to " +
              studentFirstName +
              " " +
              studentLastName +
              " (" +
              studentNumber +
              ") <" +
              message.to +
              ">"
          );
          numSuccessful++;
        } else {
          log(
            "\nFAILED to send email to " +
              studentFirstName +
              " " +
              studentLastName +
              " (" +
              studentNumber +
              ") <" +
              message.to +
              ">"
          );
          log(error || success);
          log("");
        }
        moveToNext(5000);
      });
    } else {
      process.stdout.write(".");
      numSuccessful++;
      moveToNext();
    }
  });
  pdfDoc.pipe(
    fs.createWriteStream(
      path.normalize(__dirname + "/" + outputFolder + "/" + pdfFileName)
    )
  );
  pdfDoc.end();
}

var csv; // the actual data of the CSV file, as an array of arrays

// Reads in the CSV file of assignment marks and iterates through it.
function readCsvAndIterate() {
  var csvFile = fs.createReadStream(csvFileName);
  var csvParser = csvParse();
  csv = [];
  csvParser.on("readable", function () {
    var row;
    while ((row = csvParser.read())) {
      csv.push(row);
    }
  });
  csvParser.on("error", function (err) {
    throw "CSV parser error: " + err.message;
  });
  csvParser.on("finish", function () {
    // Do we have a proper number of rows?
    if (csv.length < config.maxMarksRowIndex + 1) {
      throw "Not enough rows were found in the CSV file.";
    }

    // Start generating PDF files for the students
    var maxMarksRow = csv[config.maxMarksRowIndex - 1];
    generateStudentPdf(config.maxMarksRowIndex, maxMarksRow);
  });
  csvFile.pipe(csvParser);
}

// Gets the user's password, create a transport to the SMTP server, and
// calls readCsvAndIterate().
function setUpMailerAndGo() {
  var passwordPromise = promptly.password("Enter your email password: ", {
    replace: "*",
  });

  passwordPromise.then(function (password) {
    var transportSetup = config.smtp;
    transportSetup.auth.pass = password;
    mailer = nodemailer.createTransport(transportSetup);

    mailer.verify(function (error, success) {
      if (error) {
        console.error(error);
      } else {
        console.log("Successfully connected to SMTP server\n");
        readCsvAndIterate();
      }
    });
  });
}

var mailer;
var numSuccessful = 0;
var numSkipped = 0;
if (mailMode === 0) {
  // No mailing, just generate the PDFs
  console.log("");
  log("S = skipped, x = invalid student ID");
  log("");
  readCsvAndIterate();
} else if (mailMode === 2 && !idsToInclude) {
  console.log("");
  console.log("You are about to send emails to the ENTIRE class.");
  console.log(
    "If you only want to send emails to some students, set the --ids parameter."
  );
  promptly
    .prompt('To proceed, type "sure": ', {
      validator: function (x) {
        if (x !== "sure") {
          throw new Error();
        }
      },
      retry: false,
    })
    .then(setUpMailerAndGo, function () {
      console.log("Aborted.");
    });
} else {
  setUpMailerAndGo();
}
