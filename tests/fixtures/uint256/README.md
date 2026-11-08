# uint256 deploy vectors

Source: [ASI Rust node 43d69b76046a3750527ad4495074f71a6dd15afb](https://github.com/asi-alliance/asi-chain-rust-node/tree/43d69b76046a3750527ad4495074f71a6dd15afb), equal to upstream dev on 8 November 2026.

The vectors were generated with prost 0.14 from the selected DeployDataProto declaration, an unsigned wrapper mirroring DeployData::_to_proto for SDK-supported fields, the selected node crypto Signed::create/verify and shared TokenAmount code. The synthetic signing key is 32 bytes of 0x01. Parameters and expiration are omitted, as in the SDK API. Prices cover 1, 2^53+1, 2^63, 2^128 and uint256 maximum; validAfterBlockNumber covers -1 and 99. All ten generated signatures passed the node crypto verifier.

This is source-derived codec/crypto validation, not funded live-node acceptance. Executable SDK regression checks and portable regeneration tooling are pending in the draft PR.
