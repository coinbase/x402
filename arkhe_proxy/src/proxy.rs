use aws_sdk_sagemaker::Client as SageMakerClient;
use aws_sdk_s3::Client as S3Client;
use aws_sdk_sagemaker::types::{AlgorithmSpecification, Channel, DataSource, S3DataSource, S3DataType, TrainingInputMode};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};

#[derive(Clone)]
pub struct SageMakerProxy {
    sagemaker_client: SageMakerClient,
    s3_client: S3Client,
    #[allow(dead_code)]
    kms_key_id: String,
    bucket_name: String,
}

impl SageMakerProxy {
    pub fn new(sagemaker_client: SageMakerClient, s3_client: S3Client, kms_key_id: String, bucket_name: String) -> Self {
        Self {
            sagemaker_client,
            s3_client,
            kms_key_id,
            bucket_name,
        }
    }

    pub async fn train(&self, input_data: Vec<u8>, _hyperparameters: serde_json::Value) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        // 1. Criptografia efêmera
        let key = Key::<Aes256Gcm>::from_slice(&[0u8; 32]); // KMS-derived key
        let cipher = Aes256Gcm::new(&key);
        let nonce = Nonce::from_slice(b"unique nonce"); // 96-bits / 12-bytes
        let ciphertext = cipher.encrypt(nonce, input_data.as_ref())
            .map_err(|e| format!("Encryption error: {:?}", e))?;

        // 2. Upload para S3 efêmero
        let s3_key = format!("train/{}.enc", uuid::Uuid::new_v4());
        self.s3_client.put_object()
            .bucket(&self.bucket_name)
            .key(&s3_key)
            .body(ciphertext.into())
            .send()
            .await?;

        // 3. Criar Training Job
        let job_name = format!("arkhe-train-{}", uuid::Uuid::new_v4());
        let s3_uri = format!("s3://{}/{}", self.bucket_name, s3_key);

        let algorithm_spec = AlgorithmSpecification::builder()
            .training_image("arkhe-training-image")
            .training_input_mode(TrainingInputMode::File)
            .build();

        let s3_data_source = S3DataSource::builder()
            .s3_data_type(S3DataType::S3Prefix)
            .s3_uri(s3_uri)
            .build();

        let data_source = DataSource::builder()
            .s3_data_source(s3_data_source)
            .build();

        let channel = Channel::builder()
            .channel_name("training")
            .data_source(data_source)
            .build();

        let training_job = self.sagemaker_client.create_training_job()
            .training_job_name(&job_name)
            .role_arn("arn:aws:iam::123456789012:role/ArkheSageMakerRole")
            .algorithm_specification(algorithm_spec)
            .input_data_config(channel)
            .resource_config(
                aws_sdk_sagemaker::types::ResourceConfig::builder()
                    .instance_type(aws_sdk_sagemaker::types::TrainingInstanceType::MlP32Xlarge)
                    .instance_count(1)
                    .volume_size_in_gb(50)
                    .build()
            )
            .stopping_condition(
                aws_sdk_sagemaker::types::StoppingCondition::builder()
                    .max_runtime_in_seconds(3600)
                    .build()
            )
            .output_data_config(
                aws_sdk_sagemaker::types::OutputDataConfig::builder()
                    .s3_output_path(format!("s3://{}/output", self.bucket_name))
                    .build()
            )
            .send()
            .await?;

        Ok(training_job.training_job_arn.unwrap_or(job_name))
    }
}
