const assert = require('assert');
const fs = require('fs');
const { parse } = require('csv-parse');
const { promisify } = require('util');

const parseCSV = async (filePath) => {
  return new Promise((resolve, reject) => {
    const records = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true }))
      .on('data', (data) => records.push(data))
      .on('end', () => resolve(records))
      .on('error', (error) => reject(error));
  });
};

describe('CSV Parsing', function() {
  it('should parse a valid CSV file correctly', async function() {
    // Create a temporary CSV file using a string or a fixture
    const csvData = `name,age\nAlice,30\nBob,25\n`;
    const tempFile = './test/temp.csv';
    fs.writeFileSync(tempFile, csvData);

    const records = await parseCSV(tempFile);
    assert.strictEqual(records.length, 2);
    assert.strictEqual(records[0].name, 'Alice');
    assert.strictEqual(records[1].age, '25');

    // Clean up
    fs.unlinkSync(tempFile);
  });

  it('should throw an error for a malformed CSV', async function() {
    // Intentionally malform the CSV to expect a parsing error
    const badCsv = `name,age\nAlice\nBob,25\n`;
    const tempFile = './test/temp_bad.csv';
    fs.writeFileSync(tempFile, badCsv);

    try {
      await parseCSV(tempFile);
      // If no error is thrown, force a failure.
      assert.fail('Expected error was not thrown');
    } catch (err) {
      assert.ok(err, 'Error should be thrown for malformed CSV');
    } finally {
      fs.unlinkSync(tempFile);
    }
  });
});
