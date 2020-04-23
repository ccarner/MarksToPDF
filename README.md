# Marks to PDF - Canvas Edition

This script automates the generation of individual student feedback PDFs, based
on a spreadsheet (in CSV format) containing each student's personal details,
marks and feedback. It can also email the feedback PDFs to students as they are
generated.


##Canvas Modifications

Canvas allows for bulk re-uploading of files as comments on students submissions, eg we can attach a pdf with feedback to each student's submissions. To do this, however, the name of the downloaded canvas submission from teh student must be the SAME as the name of the file being reuploaded to canvas; the feature was designed to allow instructors to annotate ON the existing assignment and the reupload, we're sort of hijacking it.

More details can be found in the canvas help article here: https://community.canvaslms.com/docs/DOC-12803-4152640871

##Note: need to manually check for dupes

As part of its process,the script searches for a filename in the input/canvas_submissions foldername/ID of the student.
Script uses ID+name if the filename has the student's ID in it;  since canvas doesn't actually add the unimelb studentID to the filename when exporting, this requires students to manually add their ID in their submission title
ELSE if no match found with id+name, script tries again with only matching name. This could cause an issue with duplicates: if a student who shares an identical first+lastname doesn't include their ID in the title, when the script goes to search using just the name, it might match with the other student with the same name (regardless of whether that other student included their student number). The script warns if it uses studentname to identify a student, and then you'll need to manually check that that name isn't shared with someone else in the cohort.



## Examples

Refer to the COOK10001 example Excel sheet, JSON file, and CanvasSubmissions downloaded assignments folder in /examples

I recommend that you work from the JSON file without comments. MarksToPDF will
accept comments in the config JSON file, but JSON validators like
https://jsonlint.com won't work if you have comments. 

If the tool reports a syntax error in the JSON, use https://jsonlint.com to
debug the JSON.

## Instructions

1. You will need Node.js and npm installed. I have had success running the script on the Windows Subsystem for Linux on Windows 10, but I expect it would work well on other systems, even with older versions of Node.js.

2. Before running the script for the first time, run `npm install` to fetch dependencies.

3. Prepare a CSV file with student marks. This should contain one row for every student (rows with no student number, or an invalid student number, will be ignored). The row containing the maximum available marks for each question should come before the first student row. If you are going to use the email functionality, make sure there is a column that contains student email addresses.
- If there are students who should not receive feedback (e.g. suspected of academic misconduct), you can either delete their rows from the CSV, or mask the email addresses by prefixing them with XXXX or similar.

5. Prepare a configuration JSON file. There are various example JSON files included in `/example`, which contain documentation explaining what is required. If you need advice, or you want to do something that does not appear possible, please contact Alan Thomas <alan.thomas@unimelb.edu.au>.

7. Download all canvas documents, and place into `input/canvas_submissions`

6. Run the script. A typical invocation to generate PDFs without emailing them might look like:

```
$ node markstopdf.js --config info20003-2018-s1-a1.json --csv a1studentmarks.csv
```
See the 'command line args' section below for more details.

7. [Note to Colton: for further notes on how to upload to canvas, see onenote Tutoring notebook]

##Commandline Args

```
usage: node markstopdf [--ids 123456,345678,...] [--mail n] --config config.json --csv marks.csv
--ids list,of,ids     optional: only generate PDFs for the given student IDs
--mail 1, --mail 2    optional: whether to email the generated PDFs
                        --mail 1: send all the emails to the subject coordinator
                        --mail 2: actually send an email to each student
--config config.json  required: the JSON configuration file for this assignment
--csv marks.csv       required: the CSV file containing the marks data
```


## Contact

If you have any questions or feedback, contact Alan Thomas
<alan.thomas@unimelb.edu.au> or <colton.carner ‘at’ unimelb.edu.au>


?   .gitignore
?   markstopdf.js
?   package.json
?   README.md
?
????examples
?   ?   COOK10001-example-with-comments.json
?   ?   COOK10001-example.json
?   ?   COOK10001-example.xlsx
?   ?
?   ????cook_canvas_submissions
?           ...
?
????fonts
?       ...
?
????input
    ?   myPdfSpec.json
    ?   myStudentGrades.csv
    ?
    ????canvas_submissions
            .gitignore **[Don’t remove; allows empty directory in git]**
            student1LnameFname_canvasidentifiers_studentPdfTitle1.pdf
            student2LnameFname_canvasidentifiers_studentPdfTitle2.pdf

		
		


