function handleExcelImportSiswa(e) {
  if (typeof XLSX === 'undefined') return showNotification("Gagal", "Modul Excel sedang dimuat.", "danger");
  if (!firebaseUser) return; const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = async (ev) => {
    toggleLoader(true);
    try {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      if (json.length < 2) throw new Error("Kosong");
      let batch = writeBatch(); let opCount = 0; let l = 0;
      for (let i = 1; i < json.length; i++) {
        if (json[i][0] && json[i][1] && json[i][3]) {
          const nis = String(json[i][0]).trim();
          batch.set(getPublicDoc("Siswa", nis), {
            nis,
            nama: String(json[i][1]).trim(),
            jenis_kelamin: json[i][2] ? String(json[i][2]).trim() : "L",
            kelas: String(json[i][3]).trim(),
            password: json[i][4] ? String(json[i][4]).trim() : "123456"
          });
          l++; opCount++;
          if (opCount >= 450) {
            await batch.commit();
            batch = writeBatch();
            opCount = 0;
          }
        }
      }
      if (opCount > 0) await batch.commit();
      showNotification("OK", `${l} tersimpan`, "success");
    } catch (er) { showNotification("Err", er.message, "danger"); } finally { toggleLoader(false); e.target.value = ""; }
  }; r.readAsArrayBuffer(f);
}

function downloadSiswaTemplate() {
  if (typeof XLSX === 'undefined') return showNotification("Gagal", "Modul Excel dimuat.", "danger");
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["NIS", "Nama", "Jenis Kelamin", "Kelas", "Password"], ["123", "AR Siswa", "L", "XII MIPA 1", "pass123"]]), "Format"); XLSX.writeFile(wb, "Template.xlsx");
}

async function handleDownloadKartuUjian() {
  if (typeof window.jspdf === 'undefined') {
    return showNotification("Gagal", "Modul PDF belum siap. Coba beberapa saat lagi.", "danger");
  }
  if (!ALL_STUDENTS.length) {
    return showNotification("Kosong", "Tidak ada data siswa untuk dicetak.", "info");
  }
  toggleLoader(true, "MEMBUAT KARTU UJIAN...");
  try {
    const { jsPDF } = window.jspdf;
    const schoolName = myLocalStorage.getItem('er_sh_name') || "SMA Negeri 2 Kuningan";
    const logoUrl = typeof resolveSchoolLogoUrl === 'function'
      ? resolveSchoolLogoUrl(myLocalStorage.getItem('er_sh_logo'))
      : (myLocalStorage.getItem('er_sh_logo') || 'https://iili.io/B5MMKiX.png');
    const siteBase = typeof getAppBaseUrl === 'function'
      ? getAppBaseUrl()
      : 'https://arnnon28.github.io/smandacbt';
    const qrUrl = typeof buildExamOpenQrUrl === 'function'
      ? buildExamOpenQrUrl(siteBase, 'index.html')
      : `${siteBase}/open.html?to=index.html`;

    let logoDataUrl = null;
    try {
      const resp = await fetch(logoUrl);
      const blob = await resp.blob();
      logoDataUrl = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(blob);
      });
    } catch (_) { logoDataUrl = null; }

    const sorted = [...ALL_STUDENTS].sort((a, b) => {
      const kc = String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id');
      if (kc !== 0) return kc;
      return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
    });

    const doc = new jsPDF('p', 'mm', 'a4');
    const kartuLebar = 85.6;
    const kartuTinggi = 50;
    const marginX = 8;
    const marginY = 6;
    const posXAwal = 15.4;
    const posYAwal = 10;
    const BLUE = [34, 102, 170];

    function drawCbtHeaderIcon(doc, boxX, boxY, boxW, boxH) {
      doc.setDrawColor(255, 255, 255);
      doc.setFillColor(...BLUE);
      doc.setLineWidth(0.4);
      doc.roundedRect(boxX + 1, boxY + 2, boxW - 2, boxH - 5, 0.8, 0.8, 'FD');
      doc.setFillColor(255, 255, 255);
      doc.rect(boxX + 2, boxY + 3, boxW - 4, boxH - 7.5, 'F');
      doc.setFillColor(255, 255, 255);
      doc.rect(boxX + boxW / 2 - 1.5, boxY + boxH - 3.5, 3, 1.5, 'F');
      doc.rect(boxX + boxW / 2 - 3.5, boxY + boxH - 2, 7, 0.8, 'F');
    }

    let posX = posXAwal;
    let posY = posYAwal;
    let col = 0;
    let rowCount = 0;

    for (let i = 0; i < sorted.length; i++) {
      const student = sorted[i];
      let qrDataUrl = null;
      try {
        if (typeof QRious !== 'undefined') {
          const qr = new QRious({ value: qrUrl, size: 220, level: 'M' });
          qrDataUrl = qr.toDataURL('image/jpeg');
        }
      } catch (_) { }

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...BLUE);
      doc.setLineWidth(0.3);
      doc.roundedRect(posX, posY, kartuLebar, kartuTinggi, 3, 3, 'FD');

      doc.setFillColor(...BLUE);
      doc.roundedRect(posX, posY, kartuLebar, 14, 3, 3, 'F');
      doc.rect(posX, posY + 7, kartuLebar, 7, 'F');

      if (logoDataUrl) {
        try {
          doc.addImage(logoDataUrl, 'PNG', posX + 3, posY + 2, 10, 10);
        } catch (_) { }
      }

      drawCbtHeaderIcon(doc, posX + kartuLebar - 14, posY + 1.5, 11, 11);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(255, 255, 255);
      doc.text('KARTU UJIAN SISWA', posX + kartuLebar / 2, posY + 5.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(schoolName, posX + kartuLebar / 2, posY + 10, { align: 'center' });

      const labelX = posX + 5;
      const valX = labelX + 16;
      let textY = posY + 20;

      const drawDataRow = (label, value, valueColor = [10, 10, 10], isBold = true) => {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(7.5);
        doc.text(label, labelX, textY);
        doc.text(':', labelX + 13, textY);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
        doc.setFontSize(8);
        const lines = doc.splitTextToSize(String(value), 36);
        for (let li = 0; li < lines.length; li++) {
          doc.text(lines[li], valX, textY);
          if (li < lines.length - 1) textY += 3.5;
        }
        textY += 4.5;
      };

      drawDataRow('Nama', student.nama || '-');
      drawDataRow('NIS', student.nis || '-');
      drawDataRow('Kelas', student.kelas || '-');
      drawDataRow('Password', student.password || '-', [220, 50, 50], true);

      if (qrDataUrl) {
        const qrSize = 20;
        doc.addImage(qrDataUrl, 'JPEG', posX + kartuLebar - qrSize - 4, posY + 15, qrSize, qrSize);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(5.5);
        doc.text('Scan: Android / iPhone', posX + kartuLebar - qrSize / 2 - 4, posY + 15 + qrSize + 2.2, { align: 'center' });
      }

      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(7.5);
      doc.text('--Computer Based Test--', posX + kartuLebar / 2, posY + kartuTinggi - 5.5, { align: 'center' });

      doc.setFillColor(...BLUE);
      doc.roundedRect(posX, posY + kartuTinggi - 3, kartuLebar, 3, 3, 3, 'F');
      doc.rect(posX, posY + kartuTinggi - 3, kartuLebar, 1.5, 'F');

      col++;
      if (col === 2) {
        col = 0;
        rowCount++;
        posX = posXAwal;
        posY += kartuTinggi + marginY;
      } else {
        posX += kartuLebar + marginX;
      }
      if (rowCount === 5 && i < sorted.length - 1) {
        doc.addPage();
        posX = posXAwal;
        posY = posYAwal;
        col = 0;
        rowCount = 0;
      }
    }

    doc.save('Kartu_Ujian_Siswa.pdf');
    showNotification("Sukses", `${sorted.length} kartu ujian berhasil dibuat!`, "success");
  } catch (err) {
    console.error('handleDownloadKartuUjian error:', err);
    showNotification("Gagal", err.message || "Gagal membuat kartu ujian.", "danger");
  } finally {
    toggleLoader(false);
  }
}

function downloadWordTemplate() {
  const url = './assets/template/template_soal.docx';
  const link = document.createElement('a');
  link.href = url;
  link.download = 'template_soal.docx';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function handleDOCXImportSoal(e) {
  if (typeof mammoth === 'undefined') { showNotification("Belum Siap", "Pustaka DOCX masih diunduh.", "danger"); e.target.value = ""; return; }
  if (!firebaseUser) return;
  const f = e.target.files[0];
  const packetId = document.getElementById('manual-question-packet').value.trim();
  const isNewPacket = packetId === '__new__';
  const newPacketName = isNewPacket ? document.getElementById('manual-new-packet-name')?.value.trim() : null;
  if (!packetId) { showNotification("Pilih Paket", "Pilih Soal terlebih dahulu", "info"); e.target.value = ""; return; }
  if (isNewPacket && !newPacketName) { showNotification("Nama Soal", "Masukkan nama soal.", "info"); e.target.value = ""; return; }
  if (!f) return;
  const r = new FileReader(); r.onload = function (ev) {
    toggleLoader(true);

    const mammothOptions = {
      convertImage: mammoth.images.imgElement(function (image) {
        return image.read("base64").then(function (imageBuffer) {
          return {
            src: "data:" + image.contentType + ";base64," + imageBuffer
          };
        });
      })
    };

    mammoth.convertToHtml({ arrayBuffer: ev.target.result }, mammothOptions).then(async (res) => {
      const div = document.createElement('div'); div.innerHTML = res.value;
      const qs = [];
      let cq = null;
      let pendingImage = null;
      for (let p of div.querySelectorAll('p')) {
        const imgEl = p.querySelector('img');
        let img = null;
        if (imgEl && imgEl.src.startsWith('data:image')) {
          const maxKb = typeof BANK_SOAL_IMAGE_MAX_KB === 'number' ? BANK_SOAL_IMAGE_MAX_KB : 50;
          img = createImageAsset(await ensureImageUnderMaxKb(imgEl.src, maxKb));
        }

        let rawHtml = p.innerHTML.replace(/<img[^>]*>/gi, '').trim();
        let txt = rawHtml.replace(/<[^>]*>/g, '').trim();

        const keyMatch = txt.match(/^(.*?)(?:\s*(?:kunci|jawaban|answer)\s*[:=]?\s*([A-Ea-e])\s*)$/i);
        if (keyMatch && cq) {
          txt = keyMatch[1].trim();
          cq.correct_key = keyMatch[2].toUpperCase();
        }
        if (img && !txt) {
          pendingImage = img;
          if (cq && !cq.image) {
            cq.image = pendingImage;
            pendingImage = null;
          } else if (cq && cq.opsi?.length) {
            const lastOpt = cq.opsi[cq.opsi.length - 1];
            if (lastOpt && !lastOpt.image) {
              lastOpt.image = pendingImage;
              pendingImage = null;
            }
          }
          continue;
        }
        const om = txt.match(/^([A-Ea-e])(?:[\.\)\s]+)(.*)/);
        const qm = txt.match(/^(\d+)(?:[\.\)\s]+)(.*)/);
        if (qm) {
          if (cq) qs.push(cq);
          const questionHtml = sanitizeHtmlContent(rawHtml.replace(/^\s*\d+[\.\)\s]+/, '').trim() || qm[2].trim());
          cq = {
            id: `q_${qs.length + 1}`,
            nomer: parseInt(qm[1], 10),
            soal: questionHtml,
            image: pendingImage,
            opsi: []
          };
          pendingImage = null;
        } else if (/^(kunci|jawaban|answer)[:\-]\s*([A-Ea-e])/.test(txt) && cq) {
          cq.correct_key = txt.match(/^(kunci|jawaban|answer)[:\-]\s*([A-Ea-e])/i)[2].toUpperCase();
          pendingImage = null;
        } else if (om && cq) {
          const optionHtml = sanitizeHtmlContent(rawHtml.replace(new RegExp(`^\s*${om[1]}[\.\)\s]+`), '').trim() || om[2].trim());
          cq.opsi.push({ key: om[1].toUpperCase(), text: optionHtml, image: pendingImage });
          pendingImage = null;
        } else if (cq) {
          const addedHtml = sanitizeHtmlContent(rawHtml || txt);
          cq.soal += "\n" + addedHtml;
          if (pendingImage && !cq.image) {
            cq.image = pendingImage;
            pendingImage = null;
          }
        }
      }
      if (cq) qs.push(cq);
      if (!qs.length) throw new Error("Format salah");
      const targetPacketId = isNewPacket ? `pkt_${Date.now()}` : packetId;
      const selectedPacket = isNewPacket
        ? { id_paket: targetPacketId, nama_paket: newPacketName, daftar_soal: [] }
        : await ensureAdminPacketLoaded(packetId);
      if (!selectedPacket) throw new Error("Paket tidak ditemukan");
      const updatedQuestions = [...(selectedPacket.daftar_soal || []), ...qs];
      const pld = typeof normalizeBankSoalPacket === 'function'
        ? normalizeBankSoalPacket({
          id_paket: targetPacketId,
          nama_paket: selectedPacket.nama_paket,
          daftar_soal: updatedQuestions,
          konten_versi: new Date().toISOString()
        })
        : {
          id_paket: targetPacketId,
          nama_paket: selectedPacket.nama_paket,
          daftar_soal: updatedQuestions,
          konten_versi: new Date().toISOString()
        };

      await publishBankSoalPacket(pld);
      await setDoc(getPublicDoc("Bank Soal", targetPacketId), pld);
      const idx = ALL_PACKETS.findIndex(p => p.id_paket === targetPacketId);
      if (idx >= 0) ALL_PACKETS[idx] = pld; else ALL_PACKETS.push(pld);
      const packetSelectEl = document.getElementById('manual-question-packet');
      if (packetSelectEl) packetSelectEl.value = targetPacketId;
      renderPacketsCards();
      refreshBankSoalDropdowns(true);
      updateManualPacketMode();
      if (!document.getElementById('banksoal-tab-view')?.classList.contains('hidden')) {
        renderBankSoalQuestionList();
      }
      showNotification("OK", `${qs.length} Soal ditambahkan ke paket`, "success");
    }).catch(er => showNotification("Err", er.message, "danger")).finally(() => { toggleLoader(false); e.target.value = ""; });
  }; r.readAsArrayBuffer(f);
}
