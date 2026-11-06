// src/features/master/user/components/SaveResultBox.jsx
import React from "react";
import styles from "./userManagement.styles";

/** Presentational: kotak hasil simpan (fatal / sukses + error role). */
const SaveResultBox = ({ result }) => {
    if (!result) return null;

    return (
        <div
            style={{
                ...styles.resultBox,
                background: result.fatal ? "#ffebee" : "#e8f5e9",
                borderColor: result.fatal ? "#ef9a9a" : "#a5d6a7",
            }}
        >
            {result.fatal ? (
                <>❌ <strong>Gagal:</strong> {result.fatal}</>
            ) : (
                <>
                    ✅ <strong>User "{result.userName || "baru"}" berhasil dibuat</strong> (AD_User_ID: {result.userId})
                    {result.roleTotal > 0 && (
                        <div style={{ marginTop: "6px", fontSize: "13px" }}>
                            Role ter-assign: {result.roleOk}/{result.roleTotal}
                            {result.roleErrors.length > 0 && (
                                <ul style={{ margin: "6px 0 0", paddingLeft: "18px", color: "#c62828" }}>
                                    {result.roleErrors.map((msg, i) => <li key={i}>{msg}</li>)}
                                </ul>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default SaveResultBox;
