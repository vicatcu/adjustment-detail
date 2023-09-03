const fs = require('fs/promises');
const path = require('path');
const _ = require('lodash');

function recordToString(r) {
  // {
  //   date: 'Thursday 31 August 2023',
  //   'Account No': '241760',
  //   Client: 'USDA NAHMS Study/Dr. Bettina',
  //   Amount: '$343.35',
  //   Type: 'Invoiced',
  //   Reason: 'null',
  //   'Adjusted By': 'KAB478'
  // }
  return `"${r['Account No']}","${r.Client}","${r.Amount}","${r.Type}","${r.Reason}","${r['Adjusted By']}"`;
}

function currencyString(n) {
  return `$${(+n.toFixed(2)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

function buildRecord(record, lineNumber) {
  if (record.length > 0) {
    const r = {};
    r.date = record[0][0];
    if (record[2]?.length === 6) {
      for (let ii = 0; ii < 6; ii++) {          
        r[record[1][ii]] = record[2][ii];  
      }
    } else if (record[2]?.length === 4) {
      for (let ii = 0; ii < 2; ii++) {
        if (record[2]) {
          r[record[1][ii]] = record[2][ii];  
        }
      }
      for (let ii = 2; ii < 4; ii++) {
        if (record[3]) {
          r[record[1][ii]] = record[3][ii - 2];  
        }
      }
      for (let ii = 4; ii < 6; ii++) {
        if (record[2]) {
          r[record[1][ii]] = record[2][ii - 2];  
        }
      }
    }

    if (!['Account', 'Invoiced'].includes(r.Type)) {
      for (const l of record) {
        for (let ii = 0; ii < l.length; ii++) {
          let w = l[ii];              
          w = w.replace('Account No', '').trim();
          w = w.replace('Client', '').trim();
          w = w.replace('Amount', '').trim();
          w = w.replace('Type', '').trim();
          w = w.replace('Reason', '').trim();
          w = w.replace('Adjusted By', '').trim();
          l[ii] = w;
        }
      }
      record = record.reduce((t, v) => t.concat(v), []).map(v => v.trim()).filter(v => v);
      const dateTotalIdx = record.indexOf('Date Total:');
      if (dateTotalIdx >= 0) {
        record.splice(dateTotalIdx, 2);
      }
      // if anything looks like Month Year, drop it
      record = record.filter(v => {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'Octoboer', 'November', 'December'];
        let startsWithMonth = false;
        for (const m of months) {
          if (v.startsWith(m)) {
            startsWithMonth = true;
            break;
          }
        }
        
        if (startsWithMonth) {
          const parts = v.split(/\s+/);
          if (isNumeric(parts[1])) {
            return false; // it starts with month, and ends with a number
          }
        }

        return true;
      });

      r['date'] = record[0];
      r['Account No'] = record[1];
      const amountIdx = record.findIndex(v => v.includes('$'));
      if (amountIdx >= 0) {
        r['Amount'] = record[amountIdx];
      }
      const typeIdx = record.findIndex(v => ['Account', 'Invoiced'].includes(v));
      if (typeIdx >= 0) {
        r['Type'] = record[typeIdx];
        r['Reason'] = record[typeIdx + 1];
        r['Adjusted By'] = record[typeIdx + 2];
      }
      let remainingRecord = record;
      if (dateTotalIdx >= 0) {
        remainingRecord = record.slice(0, dateTotalIdx);
      }
      remainingRecord = remainingRecord.filter((v, idx) => ![0, 1, amountIdx, typeIdx, typeIdx + 1, typeIdx + 2].includes(idx));
      r['Client'] = remainingRecord.join(' ');          
    }
    
    if (!['Account', 'Invoiced'].includes(r.Type)) {
      console.log('UNEXPECTED TYPE', lineNumber, record, r);
    }

    if (!isNumeric(r['Account No'])) {
      console.log('NON-NUMERIC ACCOUNT NO', lineNumber, record, r);
    }
    
    if (r.Reason === undefined) {
      // scan the record for something like 'Reason '
      const reason = _.flatten(record).find(v => v.startsWith('Reason '));
      if (reason) {
        r.Reason = reason.split('Reason ')[1];
      }
    }
    if (r.Reason === undefined) {
      console.log('UNDEFINED REASON', lineNumber, record, r);
    }

    if (r['Adjusted By'] === undefined) {
      // scan the record for something like 'Adjusted By '
      const adjustedBy = _.flatten(record).find(v => v.startsWith('Adjusted By '));
      if (adjustedBy) {
        r['Adjusted By'] = adjustedBy.split('Adjusted By ')[1];
      }
    }
    if (r['Adjusted By'] === undefined) {
      console.log('UNDEFINED Adjusted By', lineNumber, record, r);
    }

    if (r.Amount) {
      r.amount = +r.Amount.replace(/[$, ]/g, '');
    } else {
      console.log(lineNumber,'Amount is missing');
    }

    if (!isNumeric(r.amount)) {
      console.log('NON-NUMERIC AMOUNT', lineNumber, r, record);
    }

    return r;
  }
  return null;
}

async function run() {
  const inputPath = path.resolve(__dirname, 'input.txt');
  const content = await fs.readFile(inputPath, 'utf8');
  const lines = content.split(/[\r\n]+/);
  const groupedLines = [];
  let record = [];  
  let lineNumber = 0;
  for (let line of lines) {
    ++lineNumber;
    const parts = line.split(/\s+/);
    const daysOfTheWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Client Account Adjustments', 'Invoiced Adjustments', 'Adjustment Total'];
    if (daysOfTheWeek.includes(parts[0])) {
      const r = buildRecord(record, lineNumber);
      if (r) {
        groupedLines.push(r);
        // console.log(record);
        // console.log(r);
        // console.log(recordToString(r));
      } 
      record = [];
    }
    line = line.trim().replace(/"/g, '');
    if (line.length > 0) {
      const p = line.split(/\t{3,}|\s{3,}/).filter(v => v.trim());
      const pp = [];
      for (const _p of p) {
        const ppp = _p.split(/\t+/);
        if (ppp.length > 2) {
          pp.push(ppp.slice(0, -1).join(' '));
          pp.push(ppp.slice(-1)[0]);
        } else if (ppp.length === 2) {
          pp.push(ppp[0]);
          pp.push(ppp[1]);
        } else {
          pp.push(_p);
        }
      }
      record.push(pp);
    }
  }

  if (record.length > 0) {
    const r = buildRecord(record, lineNumber);
    if (r) {
      groupedLines.push(r);
      // console.log(record);
      // console.log(r);
      // console.log(recordToString(r));
    } 
  }

  // now there are a consistent set of records like this:
  // {
  //   date: 'Thursday 31 August 2023',
  //   'Account No': '241760',
  //   Client: 'USDA NAHMS Study/Dr. Bettina',
  //   Amount: '$343.35',
  //   Type: 'Invoiced',
  //   Reason: 'null',
  //   'Adjusted By': 'KAB478'
  // }
  const sortedByAccountNumberThenByType = groupedLines.slice().sort((a, b) => {
    if (a['Type'] < b['Type']) { return -1; }
    if (a['Type'] > b['Type']) { return +1; }
    if (+a['Account No'] < +b['Account No']) { return -1; }
    if (+a['Account No'] > +b['Account No']) { return +1; }
    return 0;
  });

  const groupedByType = _.groupBy(groupedLines, v => v.Type);
  console.log(Object.keys(groupedByType));
  for (const k of Object.keys(groupedByType)) {
    if (!['Account', 'Invoiced'].includes(k)) {
      console.log(k, groupedByType[k]);
    }
  }

  const totalLines = [];
  for (const k of Object.keys(groupedByType)) {
    const t = `"","","${currencyString(groupedByType[k].reduce((t, v) => t + v.amount, 0))}","${k} Total"`;
    totalLines.push(t);
  }
  const grandTotal = `"","","${currencyString(sortedByAccountNumberThenByType.reduce((t, v) => t + v.amount, 0))}","Grand Total"`;
  const superHeading = '"Adjustment Detail by Statement Date"';
  let output = sortedByAccountNumberThenByType.map(recordToString).join('\r\n');
  const heading = `"Account No","Client","Amount","Type","Reason","Adjusted By"`;
  output = [].concat([superHeading]).concat(totalLines).concat([grandTotal]).concat([heading]).concat([output]).join('\r\n');
  await fs.writeFile(path.resolve(__dirname, 'output.csv'), output, 'utf8');
}

run().then(() => console.log('Done')).catch(e => console.error(e));