import ConfigInterface from '../../../ConfigInterface';
import * as DBSchema from '../../DB/DBSchema';
import { IPCServerInterface } from '../../IPC/IPCServer';
import Model from '../../Model';
import { RecordedExternalProcessModelInterface } from '../../Operator/RecordedExternalProcessModel';
import { RecordingManageModelInterface } from '../../Operator/Recording/RecordingManageModel';
import { EncodeInterface } from '../../Operator/RuleInterface';
import { ThumbnailManageModelInterface } from '../../Operator/Thumbnail/ThumbnailManageModel';
import CallbackBaseModelInterface from './CallbackBaseModelInterface';

/**
 * RecordingFinModel
 * 録画終了後の処理
 */
class RecordingFinModel extends Model implements CallbackBaseModelInterface {
    private recordingManage: RecordingManageModelInterface;
    private thumbnailManage: ThumbnailManageModelInterface;
    private externalProcess: RecordedExternalProcessModelInterface;
    private ipc: IPCServerInterface;
    private conf: ConfigInterface;

    constructor(
        recordingManage: RecordingManageModelInterface,
        thumbnailManage: ThumbnailManageModelInterface,
        externalProcess: RecordedExternalProcessModelInterface,
        ipc: IPCServerInterface,
    ) {
        super();

        this.recordingManage = recordingManage;
        this.thumbnailManage = thumbnailManage;
        this.externalProcess = externalProcess;
        this.ipc = ipc;

        this.conf = this.config.getConfig();
    }

    public set(): void {
        this.recordingManage.recEndListener((program, encode) => { this.callback(program, encode); });
    }

    /**
     * @param program: DBSchema.RecordedSchema | null
     * @param encodeOption: EncodeInterface | null
     * program が null の場合は録画中に recorded から削除された
     */
    private async callback(program: DBSchema.RecordedSchema | null, encodeOption: EncodeInterface | null): Promise<void> {
        if (program === null) { return; }

        // サムネイル生成
        this.thumbnailManage.push(program);

        // ts 前処理
        if (typeof this.conf.tsModify !== 'undefined' && program.recPath !== null) {
            await this.ipc.setEncode({
                recordedId: program.id,
                source: program.recPath,
                delTs: false,
                recordedProgram: program,
            });
        }

        // エンコード
        if (encodeOption !== null) {
            // エンコードオプションを生成
            const settings: { mode: number; directory?: string }[] = [];
            let encCnt = 0;
            if (typeof encodeOption.mode1 !== 'undefined') {
                settings.push({ mode: encodeOption.mode1, directory: encodeOption.directory1 }); encCnt += 1;
            }
            if (typeof encodeOption.mode2 !== 'undefined') {
                settings.push({ mode: encodeOption.mode2, directory: encodeOption.directory2 }); encCnt += 1;
            }
            if (typeof encodeOption.mode3 !== 'undefined') {
                settings.push({ mode: encodeOption.mode3, directory: encodeOption.directory3 }); encCnt += 1;
            }

            // エンコードを依頼する
            for (let i = 0; i < settings.length; i++) {
                if (program.recPath === null) { continue; }
                await this.ipc.setEncode({
                    recordedId: program.id,
                    source: program.recPath,
                    mode: settings[i].mode,
                    directory: settings[i].directory,
                    delTs: i === encCnt - 1 ? encodeOption.delTs : false,
                    recordedProgram: program,
                });
            }
        }

        // socket.io で通知
        this.ipc.notifIo();

        // 外部コマンド実行
        const cmd = this.conf.recordedEndCommand;
        if (typeof cmd !== 'undefined') {
            await this.externalProcess.run(cmd, program, 'recording fin');
        }
    }
}

export default RecordingFinModel;

