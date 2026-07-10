import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Upload } from 'lucide-react';

const STANDARD_PRODUCTS = [
  { code: '20050809', name: 'คาราบาวเบียร์ลาเกอร์ขวด620ml' },
  { code: '20050819', name: 'คาราบาวเบียร์ลาเกอร์กระป๋อง490ml' },
  { code: '20050810', name: 'คาราบาวเบียร์ลาเกอร์กระป๋อง320ml' },
  { code: '20050811', name: 'คาราบาวเบียร์ดุงเกลขวด620ml' },
  { code: '20050820', name: 'คาราบาวเบียร์ดุงเกลกระป๋อง490ml' },
  { code: '20050812', name: 'คาราบาวเบียร์ดุงเกลกระป๋อง320ml' },
  { code: '20050816', name: 'ตะวันแดงเบียร์โรเซ่กระป๋อง490ml' },
  { code: '20050815', name: 'ตะวันแดงเบียร์โรเซ่กระป๋อง320ml' },
  { code: '20050818', name: 'ตะวันแดงเบียร์ไอพีเอกระป๋อง490ml' },
  { code: '20050817', name: 'ตะวันแดงเบียร์ไอพีเอกระป๋อง320ml' },
  { code: '20050814', name: 'ตะวันแดงเบียร์ไวเซ่นกระป๋อง490ml' },
  { code: '20050813', name: 'ตะวันแดงเบียร์ไวเซ่นกระป๋อง320ml' },
];

const WAREHOUSES = {
  'D004': { name: 'คลังขอนแก่น', id: 'KKDC' },
  'TDEA-04': { name: 'คลังบางวัว', id: 'BWDC' }
};

export default function BeerRecallChecker() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiInput, setShowApiInput] = useState(true);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    setFiles(prev => [...prev, ...droppedFiles]);
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
    setFiles(prev => [...prev, ...selectedFiles]);
  };

  const processFiles = async () => {
    if (!apiKey) {
      alert('กรุณาใส่ Claude API Key');
      return;
    }
    if (files.length === 0) {
      alert('กรุณาเลือกไฟล์ PDF');
      return;
    }

    setLoading(true);
    try {
      const allStoreData = {};

      for (const file of files) {
        const base64 = await fileToBase64(file);
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'document',
                    source: {
                      type: 'base64',
                      media_type: 'application/pdf',
                      data: base64,
                    },
                  },
                  {
                    type: 'text',
                    text: `อ่านเอกสารตรวจเอกสาร Recall Beer นี้ แล้วส่ง JSON ที่มีโครงสร้างนี้เท่านั้น (ไม่มีข้อความอื่น):
{
  "store_code": "รหัสร้าน เช่น TH003444",
  "store_name": "ชื่อร้าน",
  "warehouse_code": "D004 หรือ TDEA-04",
  "products": [
    {
      "product_code": "20050809",
      "product_name": "ชื่อสินค้า",
      "transport_qty": 3 หรือ null ถ้าเว้นว่าง,
      "warehouse_qty": 15 หรือ null ถ้าเว้นว่าง,
      "remark": "หมายเหตุ"
    }
  ]
}

ต้องมี 12 สินค้า แม้จำนวนเป็น 0 ก็ต้องใส่
ถ้าช่องว่าง ให้เป็น null`
                  }
                ],
              }
            ],
          }),
        });

        const data = await response.json();
        const textContent = data.content[0].text;
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const storeData = JSON.parse(jsonMatch[0]);
          const key = storeData.store_code;
          allStoreData[key] = storeData;
        }
      }

      analyzeResults(allStoreData);
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const analyzeResults = (storeData) => {
    const byWarehouse = { 'D004': {}, 'TDEA-04': {} };

    for (const [storeCode, data] of Object.entries(storeData)) {
      const wh = data.warehouse_code;
      if (!byWarehouse[wh]) byWarehouse[wh] = {};

      const analysis = {
        code: storeCode,
        name: data.store_name,
        warehouse_code: wh,
        rows: [],
        status: 'PASS',
      };

      const productMap = {};
      if (data.products && Array.isArray(data.products)) {
        data.products.forEach(p => {
          productMap[p.product_code] = p;
        });
      }

      STANDARD_PRODUCTS.forEach((std) => {
        const product = productMap[std.code] || {};
        const transport = product.transport_qty;
        const warehouse = product.warehouse_qty;
        let rowStatus = 'OK';
        let remark = product.remark || '';

        if (transport === null && warehouse === null) {
          rowStatus = 'MISSING';
          remark = 'ขนส่ง และ คลัง ไม่ระบุจำนวน';
          analysis.status = 'ERROR';
        } else if (transport === null) {
          rowStatus = 'MISSING';
          remark = 'ขนส่งไม่ระบุจำนวน';
          analysis.status = 'ERROR';
        } else if (warehouse === null) {
          rowStatus = 'MISSING';
          remark = 'คลังไม่ระบุจำนวน';
          analysis.status = 'ERROR';
        } else if (transport !== warehouse) {
          rowStatus = 'MISMATCH';
          if (!remark) remark = 'ขนส่ง กับ คลัง ระบุจำนวนไม่ตรงกัน';
          analysis.status = 'ERROR';
        }

        analysis.rows.push({
          product_code: std.code,
          product_name: std.name,
          transport: transport ?? '',
          warehouse: warehouse ?? '',
          remark: remark,
          status: rowStatus,
        });
      });

      byWarehouse[wh][storeCode] = analysis;
    }

    setResults(byWarehouse);
  };

  const downloadCSV = () => {
    if (!results) return;
    let csv = 'รหัสร้าน,ชื่อร้าน,รหัสสินค้า,ชื่อสินค้า,จำนวนขนส่ง,จำนวนคลัง,Remark\n';

    for (const wh of ['D004', 'TDEA-04']) {
      const stores = results[wh] || {};
      for (const store of Object.values(stores)) {
        store.rows.forEach(row => {
          csv += `${store.code},${store.name},${row.product_code},${row.product_name},${row.transport},${row.warehouse},"${row.remark}"\n`;
        });
      }
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'BeerRecall_Results.csv';
    link.click();
  };

  const clearFiles = () => {
    setFiles([]);
    setResults(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🍺 KKDC Beer Recall Checker</h1>
          <p className="text-gray-600">ตรวจสอบเอกสารเรียกเก็บเบียร์ Recall - รอบเก็บรวบรวม</p>
        </div>

        {/* API Key Input */}
        {showApiInput && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Claude API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => setShowApiInput(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                ✓ บันทึก
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">ได้รับจาก <a href="https://console.anthropic.com" className="text-blue-600">console.anthropic.com</a></p>
          </div>
        )}

        {/* Upload Zone */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="bg-white rounded-lg shadow-lg p-8 mb-6 border-2 border-dashed border-blue-300 hover:border-blue-500 transition"
        >
          <div className="text-center">
            <Upload className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-800 mb-2">โยนไฟล์ PDF เข้าที่นี่</p>
            <p className="text-gray-600 mb-4">หรือ</p>
            <label className="px-6 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700">
              เลือกไฟล์
              <input type="file" multiple accept=".pdf" onChange={handleFileSelect} className="hidden" />
            </label>
          </div>

          {files.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="font-semibold text-gray-700 mb-3">📄 ไฟล์ที่เลือก ({files.length}):</p>
              <ul className="space-y-2">
                {files.map((f, i) => (
                  <li key={i} className="text-gray-700">• {f.name}</li>
                ))}
              </ul>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={processFiles}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-semibold"
                >
                  {loading ? '⏳ กำลังประมวลผล...' : '▶️ เริ่มตรวจสอบ'}
                </button>
                <button
                  onClick={clearFiles}
                  className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-semibold"
                >
                  ล้าง
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {results && (
          <div className="space-y-6">
            {/* Download Button */}
            <div className="text-center">
              <button
                onClick={downloadCSV}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold"
              >
                ⬇️ ดาวน์โหลด CSV
              </button>
            </div>

            {/* Results by Warehouse */}
            {Object.entries(results).map(([whCode, stores]) => {
              if (Object.keys(stores).length === 0) return null;
              const whInfo = WAREHOUSES[whCode];

              return (
                <div key={whCode} className="bg-white rounded-lg shadow-lg overflow-hidden">
                  <div className="bg-blue-600 text-white px-6 py-4">
                    <h2 className="text-2xl font-bold">{whInfo.name} ({whInfo.id})</h2>
                  </div>

                  <div className="p-6 space-y-6">
                    {Object.entries(stores).map(([storeCode, storeData]) => (
                      <div key={storeCode} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Store Header */}
                        <div
                          className={`px-4 py-3 flex items-center justify-between ${
                            storeData.status === 'PASS'
                              ? 'bg-green-100 border-b border-green-300'
                              : 'bg-red-100 border-b border-red-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {storeData.status === 'PASS' ? (
                              <CheckCircle className="w-6 h-6 text-green-600" />
                            ) : (
                              <AlertCircle className="w-6 h-6 text-red-600" />
                            )}
                            <div>
                              <p className="font-bold text-gray-800">{storeCode} - {storeData.name}</p>
                              <p className="text-sm text-gray-600">
                                {storeData.status === 'PASS'
                                  ? '✓ ตรงกันทั้ง 12 รายการ'
                                  : `✗ มีรายการไม่ตรง`}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Store Data Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100 border-b border-gray-300">
                              <tr>
                                <th className="px-4 py-2 text-left text-gray-700 font-semibold">รหัสสินค้า</th>
                                <th className="px-4 py-2 text-left text-gray-700 font-semibold">ชื่อสินค้า</th>
                                <th className="px-4 py-2 text-center text-gray-700 font-semibold">ขนส่ง</th>
                                <th className="px-4 py-2 text-center text-gray-700 font-semibold">คลัง</th>
                                <th className="px-4 py-2 text-left text-gray-700 font-semibold">Remark</th>
                              </tr>
                            </thead>
                            <tbody>
                              {storeData.rows.map((row, idx) => (
                                <tr
                                  key={idx}
                                  className={
                                    row.status === 'OK'
                                      ? 'hover:bg-gray-50'
                                      : row.status === 'MISMATCH'
                                      ? 'bg-red-50 hover:bg-red-100'
                                      : 'bg-yellow-50 hover:bg-yellow-100'
                                  }
                                >
                                  <td className="px-4 py-2 text-gray-800 font-mono">{row.product_code}</td>
                                  <td className="px-4 py-2 text-gray-700">{row.product_name}</td>
                                  <td className="px-4 py-2 text-center font-semibold">{row.transport}</td>
                                  <td className="px-4 py-2 text-center font-semibold">{row.warehouse}</td>
                                  <td className="px-4 py-2">
                                    {row.remark && (
                                      <span className={`text-xs px-2 py-1 rounded ${
                                        row.status === 'OK'
                                          ? 'bg-gray-200 text-gray-700'
                                          : 'bg-red-200 text-red-700 font-semibold'
                                      }`}>
                                        {row.remark}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
