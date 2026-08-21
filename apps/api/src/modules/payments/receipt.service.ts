import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { formatPaise } from '../../common/money';

export interface ReceiptData {
  receiptNo: string;
  date: Date;
  customerName: string;
  customerMobile: string;
  villageName: string;
  accountNumber: string;
  amountPaise: number;
  balanceAfterPaise: number;
  paymentId: string | null;
  orderId: string | null;
  status: string;
}

/**
 * Generates a downloadable/shareable PDF receipt for a deposit. Returns a Buffer
 * so the controller can stream it with the right headers.
 */
@Injectable()
export class ReceiptService {
  generate(data: ReceiptData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const accent = '#0B5FFF';

      // Header
      doc.fillColor(accent).fontSize(22).text('Digital Pigmee', { continued: false });
      doc.fillColor('#666').fontSize(10).text('Corporate Bank — Daily Micro-Savings');
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#DDD').stroke();
      doc.moveDown();

      doc.fillColor('#111').fontSize(16).text('Payment Receipt');
      doc.moveDown(0.5);

      const row = (label: string, value: string) => {
        doc.fontSize(11).fillColor('#666').text(label, 50, doc.y, { continued: true, width: 200 });
        doc.fillColor('#111').text(value);
        doc.moveDown(0.3);
      };

      row('Receipt No:', data.receiptNo);
      row('Date:', data.date.toLocaleString('en-IN'));
      row('Status:', data.status.toUpperCase());
      doc.moveDown(0.5);

      row('Customer:', data.customerName);
      row('Mobile:', data.customerMobile);
      row('Village:', data.villageName);
      row('Pigmy A/C:', data.accountNumber);
      doc.moveDown(0.5);

      if (data.paymentId) row('Payment ID:', data.paymentId);
      if (data.orderId) row('Order ID:', data.orderId);
      doc.moveDown();

      // Amount box
      const boxTop = doc.y;
      doc.roundedRect(50, boxTop, 495, 70, 8).fillAndStroke('#F4F8FF', accent);
      doc.fillColor('#666').fontSize(11).text('Amount Paid', 70, boxTop + 14);
      doc.fillColor(accent).fontSize(26).text(formatPaise(data.amountPaise), 70, boxTop + 30);
      doc.fillColor('#666').fontSize(11).text('Balance After', 360, boxTop + 14);
      doc.fillColor('#111').fontSize(18).text(formatPaise(data.balanceAfterPaise), 360, boxTop + 34);
      doc.y = boxTop + 90;

      doc.moveDown(2);
      doc
        .fillColor('#999')
        .fontSize(9)
        .text(
          'This is a system-generated receipt and does not require a signature. ' +
            'Balances are maintained via an append-only ledger.',
          { align: 'center' },
        );

      doc.end();
    });
  }
}
